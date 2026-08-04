-- ============================================================
--  마이그레이션 5 · 진도 저장 함수
--
--  왜 함수로 만드나:
--    "외웠어요" 를 누르면 두 가지를 동시에 해야 합니다.
--      1. 상태를 known 으로 바꾼다
--      2. 본 횟수를 1 늘린다
--
--    upsert 로는 2번을 표현할 수 없습니다. "지금 값에 1을 더해라" 를 못 적거든요.
--    화면에서 읽어와서 1을 더해 다시 쓰는 방법도 있지만,
--    그사이에 다른 탭에서 눌리면 숫자가 어긋납니다.
--
--    함수로 만들면 한 번에 처리되고, 화면 코드도 한 줄로 끝납니다.
--
--  앱에서 부르는 법:
--    supabase.rpc('mark_word', {
--      p_user_key: myKey, p_word_id: 'L3-0001', p_status: 'known'
--    })
-- ============================================================

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
  result public.progress;
begin
  if p_user_key is null or btrim(p_user_key) = '' then
    raise exception '사용자 번호가 없습니다';
  end if;

  insert into public.progress as pr
    (user_key, word_id, status, seen_count, correct_count, wrong_count, last_seen_at)
  values (
    p_user_key,
    p_word_id,
    p_status,
    1,
    case when p_correct is true  then 1 else 0 end,
    case when p_correct is false then 1 else 0 end,
    now()
  )
  on conflict (user_key, word_id) do update set
    status        = excluded.status,
    seen_count    = pr.seen_count + 1,
    correct_count = pr.correct_count + case when p_correct is true  then 1 else 0 end,
    wrong_count   = pr.wrong_count  + case when p_correct is false then 1 else 0 end,
    last_seen_at  = now()
  returning * into result;

  return result;
end;
$$;

comment on function public.mark_word(text, text, text, boolean) is
  '단어 하나의 학습 상태를 저장합니다. 여러 번 눌러도 줄은 하나이고 횟수만 늘어납니다';
