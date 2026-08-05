-- ============================================================
--  마이그레이션 15 · "틀리면 3분 뒤" 를 진짜로 지키게 합니다
--
--  무엇이 문제였나:
--    마이그레이션 6이 틀린 단어의 due_at 을 "3분 뒤" 로 미뤄놨는데,
--    daily_words() 가 그 값을 보지 않았습니다. 조건이 이랬습니다.
--
--      coalesce(p.status, 'new') <> 'known'   ← 안 외운 것은 무조건
--      or (due_at 이 지난 것)
--
--    앞줄이 먼저 걸려서, 방금 틀린 단어가 due_at 과 상관없이 바로 다시
--    나왔습니다. 게다가 정렬이 wrong_count desc 라 맨 앞에 왔습니다.
--    결과: 틀린 단어 하나가 화면을 계속 차지하고, 새 단어를 못 만납니다.
--
--  어떻게 고치나:
--    "다시 볼 시각이 됐는가" 하나만 봅니다. status 는 보지 않습니다.
--
--      한 번도 안 본 단어      →  나온다 (progress 줄이 아예 없음)
--      볼 시각이 지난 단어     →  나온다
--      아직 시각이 안 된 단어  →  안 나온다  ★ 이게 이번에 고친 부분
--
--    맞혀서 16일 뒤로 밀린 단어든, 틀려서 3분 뒤로 밀린 단어든
--    똑같이 "때가 되면" 나옵니다.
--
--  순서도 바꿉니다:
--    자주 틀린 것(wrong_count) 을 앞세우면 같은 단어만 계속 나옵니다.
--    복습할 때가 된 것 → 오래 기다린 것 → 자주 쓰는 새 단어 순으로 합니다.
--
--  ★ 이 파일이 daily_words 의 최종 정의입니다 (마이그레이션 6을 대신함).
-- ============================================================

create or replace function public.daily_words(
  p_user_key text,
  p_limit    integer default 10,
  p_level    smallint default 3
)
returns setof public.v_words
language sql
stable
security invoker
as $$
  select v.*
  from public.v_words v
  left join public.progress p
    on p.word_id = v.id and p.user_key = p_user_key
  where v.hsk_level = p_level
    and (
      -- 한 번도 안 본 단어
      p.word_id is null
      -- 이 기능이 없던 때 저장돼서 볼 시각이 비어 있는 단어
      or p.due_at is null
      -- 다시 볼 시각이 지난 단어
      or p.due_at <= now()
    )
  order by
    -- 복습할 때가 된 것을 새 단어보다 먼저
    case when p.word_id is null then 1 else 0 end,
    -- 그중에서도 오래 기다린 것부터
    p.due_at asc nulls first,
    -- 새 단어는 자주 쓰는 것부터
    v.frequency asc nulls last,
    v.id
  limit greatest(p_limit, 1);
$$;

comment on function public.daily_words(text, integer, smallint) is
  '오늘 볼 단어. 다시 볼 시각이 된 것 → 오래 기다린 것 → 자주 쓰는 새 단어 순서';
