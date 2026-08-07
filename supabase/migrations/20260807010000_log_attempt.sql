-- ============================================================
--  마이그레이션 17 · 문제를 푼 기록을 남기기 시작합니다
--
--  무엇이 문제였나:
--    attempts 표는 첫날부터 만들어져 있었는데, 사이트가 한 줄도 안 썼습니다.
--    지금까지 푼 문제가 전부 기록 없이 지나갔습니다.
--
--  progress 와 뭐가 다른가:
--    progress  단어 하나에 한 줄. 덮어씁니다. "지금 이 단어를 얼마나 아는가"
--    attempts  풀 때마다 한 줄. 쌓입니다.   "언제 · 어떤 문제로 · 뭘 틀렸나"
--
--    그래서 progress 만으로는 이런 걸 알 수 없습니다.
--      · 지난주보다 나아졌나 (추세)
--      · 뜻은 아는데 못 읽는 건 아닌가 (문제 유형별)
--      · 이 단어를 무엇과 헷갈리나 (고른 오답)
--
--  ★ 늦게 만들수록 손해입니다.
--    이 표는 과거를 되살릴 수 없습니다. 오늘부터 쌓이는 것만 남습니다.
--    그래서 화면에 보여줄 자리가 아직 없어도 기록부터 시작합니다.
--
--  왜 함수로 만드나 (앱에서 직접 insert 하지 않고):
--    · user_key 를 서버가 auth.uid() 로 정합니다. 앱이 남의 번호를 보낼 수 없습니다
--    · 권한에 막히면 조용히 204 로 돌아오는 사고를 피합니다
--    · progress 를 mark_word 로 저장하는 것과 같은 방식이라 헷갈리지 않습니다
-- ============================================================


-- 답한 시간의 상한. 이보다 오래 걸린 것은 "안 푼 것" 으로 봅니다.
-- 폰을 주머니에 넣었다가 10분 뒤에 답하면 평균 반응 속도가 통째로 망가집니다.
-- 기록은 남기되 시간만 비워둡니다.

create or replace function public.log_attempt(
  p_word_id     text,
  p_quiz_type   text,
  p_correct     boolean,
  p_answered_ms integer default null,
  p_meta        jsonb   default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  me      uuid := auth.uid();
  new_id  uuid;
  ms      integer := p_answered_ms;
begin
  if me is null then
    raise exception '로그인한 사람만 기록할 수 있습니다';
  end if;

  if p_correct is null then
    -- 손으로 누른 표시는 여기에 안 넣습니다. 문제를 푼 게 아니라서요.
    -- (mark_word 가 p_correct = null 을 그렇게 다룹니다)
    raise exception '맞았는지 틀렸는지가 없습니다';
  end if;

  -- 10분을 넘겼거나 음수면 시간만 버립니다. 기록 자체는 남깁니다.
  if ms is not null and (ms < 0 or ms > 600000) then
    ms := null;
  end if;

  insert into public.attempts (user_key, word_id, quiz_type, is_correct, answered_ms, meta)
  values (me::text, p_word_id, p_quiz_type, p_correct, ms, coalesce(p_meta, '{}'::jsonb))
  returning id into new_id;

  return new_id;
end;
$$;

comment on function public.log_attempt(text, text, boolean, integer, jsonb) is
  '문제를 푼 기록을 한 줄 남깁니다. 손으로 누른 표시는 넣지 않습니다';

grant execute on function public.log_attempt(text, text, boolean, integer, jsonb) to authenticated;


-- 표 자체에도 권한을 분명히 적어둡니다.
-- 지금은 Supabase 기본 설정 덕에 되고 있지만, 기본값에 기대면
-- 나중에 설정이 바뀌었을 때 조용히 안 써지고 아무도 모릅니다.
-- (RLS 규칙은 마이그레이션 11 에 이미 있습니다 — 내 줄만 읽고, 내 줄만 넣기)

grant select, insert on public.attempts to authenticated;


-- 통계를 뽑을 때 쓸 색인.
-- "이 사람이 이 단어를 언제 어떻게 틀렸나" 가 제일 자주 하는 질문입니다.
create index if not exists attempts_user_word_idx
  on public.attempts (user_key, word_id, created_at desc);
