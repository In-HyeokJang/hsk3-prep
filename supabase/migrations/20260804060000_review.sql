-- ============================================================
--  마이그레이션 6 · 반복 복습 (간격 반복)
--
--  무엇이 문제였나:
--    daily_words() 가 status <> 'known' 으로 걸러서,
--    한 번 맞힌 단어는 영영 다시 나오지 않았습니다.
--    외운 것도 시간이 지나면 까먹는데, 확인할 기회가 없었습니다.
--
--  어떻게 고치나:
--    맞힐 때마다 "다음에 볼 날짜"(due_at) 를 점점 뒤로 미룹니다.
--
--      연속 1번 맞힘  →   1일 뒤
--      연속 2번       →   3일 뒤
--      연속 3번       →   7일 뒤
--      연속 4번       →  16일 뒤
--      그 뒤로        →  35일 뒤
--
--      틀리면         →  처음부터 다시 (3분 뒤부터 나올 수 있음)
--
--    그리고 daily_words() 가 "외웠지만 볼 날짜가 지난 단어" 도 같이 꺼내옵니다.
--
--  연속 몇 번 맞혔는지는 어디에 두나:
--    progress.meta 안에 streak 로 넣습니다. 새 칸을 만들지 않았습니다.
--
--  ★ 이 파일은 mark_word 와 daily_words 의 최종 정의입니다.
--    마이그레이션 1의 drop view ... cascade 가 이 함수들을 지우므로,
--    최종 정의는 반드시 가장 나중 파일에 있어야 합니다.
-- ============================================================


-- ------------------------------------------------------------
-- 1. 예전에 외움으로 표시된 단어에 볼 날짜를 채워줍니다
-- ------------------------------------------------------------
--
-- 이 기능이 없던 때 외운 단어는 due_at 이 비어 있습니다.
-- 비워두면 영영 안 나오므로, 지금부터 볼 수 있게 표시합니다.
-- 두 번째 실행부터는 채울 게 없어서 아무 일도 일어나지 않습니다.

update public.progress
   set due_at = now()
 where status = 'known'
   and due_at is null;


-- ------------------------------------------------------------
-- 2. mark_word() · 저장하면서 다음에 볼 날짜도 정합니다
-- ------------------------------------------------------------

create or replace function public.mark_word(
  p_user_key text,
  p_word_id  text,
  p_status   text,
  p_correct  boolean default null
)
returns public.progress
language plpgsql
security invoker
as $$
declare
  result     public.progress;
  old_streak integer;
  new_streak integer;
  gap        interval;
begin
  if p_user_key is null or btrim(p_user_key) = '' then
    raise exception '사용자 번호가 없습니다';
  end if;

  -- 지금까지 연속으로 몇 번 맞혔는지. 처음 보는 단어면 줄이 없어서 null 이 됩니다.
  select coalesce((meta ->> 'streak')::integer, 0)
    into old_streak
    from public.progress
   where user_key = p_user_key
     and word_id  = p_word_id;

  old_streak := coalesce(old_streak, 0);

  if p_correct is true then
    new_streak := old_streak + 1;
    gap := case new_streak
             when 1 then interval '1 day'
             when 2 then interval '3 days'
             when 3 then interval '7 days'
             when 4 then interval '16 days'
             else        interval '35 days'
           end;
  else
    -- 틀렸으면 연속 기록은 처음으로. 3분 뒤부터 다시 나올 수 있습니다.
    -- 0분으로 두면 방금 틀린 단어만 계속 나와서 새 단어를 못 만납니다.
    new_streak := 0;
    gap := interval '3 minutes';
  end if;

  insert into public.progress as pr
    (user_key, word_id, status, seen_count, correct_count, wrong_count,
     last_seen_at, due_at, meta)
  values (
    p_user_key,
    p_word_id,
    p_status,
    1,
    case when p_correct is true  then 1 else 0 end,
    case when p_correct is false then 1 else 0 end,
    now(),
    now() + gap,
    jsonb_build_object('streak', new_streak)
  )
  on conflict (user_key, word_id) do update set
    status        = excluded.status,
    seen_count    = pr.seen_count + 1,
    correct_count = pr.correct_count + case when p_correct is true  then 1 else 0 end,
    wrong_count   = pr.wrong_count  + case when p_correct is false then 1 else 0 end,
    last_seen_at  = now(),
    due_at        = now() + gap,
    meta          = pr.meta || jsonb_build_object('streak', new_streak)
  returning * into result;

  return result;
end;
$$;

comment on function public.mark_word(text, text, text, boolean) is
  '학습 상태를 저장하고, 다음에 다시 볼 날짜를 정합니다. 맞힐수록 간격이 늘어납니다';


-- ------------------------------------------------------------
-- 3. daily_words() · 볼 날짜가 지난 단어도 같이 꺼내옵니다
-- ------------------------------------------------------------

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
      -- 아직 안 외운 것
      coalesce(p.status, 'new') <> 'known'
      -- ★ 외웠지만 다시 볼 날짜가 지난 것. 이 줄이 이번에 더한 부분입니다.
      or (p.due_at is not null and p.due_at <= now())
    )
  order by
    case when p.due_at is not null and p.due_at <= now() then 0 else 1 end,
    p.wrong_count desc nulls last,
    v.frequency asc nulls last,
    v.id
  limit greatest(p_limit, 1);
$$;

comment on function public.daily_words(text, integer, smallint) is
  '오늘 볼 단어. 복습할 때가 된 것 → 자주 틀린 것 → 자주 쓰는 것 순서';
