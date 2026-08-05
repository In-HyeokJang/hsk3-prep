-- ============================================================
--  마이그레이션 16 · 손으로 누른 표시와 퀴즈로 맞힌 것을 구분합니다
--
--  무엇이 문제였나:
--    단어 상세의 "외웠어요" 가 퀴즈 정답과 똑같이 기록됐습니다.
--    네 번 연타하면 연속 4번 맞힌 것이 되어, 복습이 35일 뒤로 밀립니다.
--    한 번도 안 풀어본 단어가 한 달 넘게 안 나오게 됩니다.
--
--  왜 그랬나:
--    mark_word 가 p_correct 를 true / 그 밖 둘로만 나눴습니다.
--    "풀지 않고 그냥 표시했다" 를 담을 자리가 없었습니다.
--
--  어떻게 고치나:
--    p_correct 를 세 가지로 읽습니다.
--
--      true   퀴즈에서 맞힘   →  연속 기록 +1, 간격이 늘어남 (1 · 3 · 7 · 16 · 35일)
--      false  퀴즈에서 틀림   →  연속 기록 0,  3분 뒤
--      null   손으로 표시함   →  연속 기록 그대로  ★ 이번에 더한 부분
--
--    손으로 표시했을 때:
--      · '외웠어요' → 하루 뒤에 확인합니다.
--        이미 그보다 더 뒤로 잡혀 있으면 그대로 둡니다.
--        (연속 3번 맞혀 7일 뒤로 잡힌 단어를, 버튼 한 번이 앞당기면 안 됩니다)
--      · '아직이요' → 3분 뒤부터 다시 나옵니다. 모른다고 직접 말한 것이니
--        연속 기록은 처음으로 되돌립니다.
--      · 푼 횟수(seen_count) 는 올리지 않습니다. 문제를 푼 게 아니라서요.
--
--    그래서 연타해도 늘 "하루 뒤" 에 멈춥니다.
--
--  ★ 이 파일이 mark_word 의 최종 정의입니다 (마이그레이션 6을 대신함).
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
  result     public.progress;
  old_streak integer;
  new_streak integer;
  old_due    timestamptz;
  next_due   timestamptz;
  gap        interval;
  -- 퀴즈로 푼 것인가. null 이면 손으로 누른 표시입니다.
  from_quiz  boolean := p_correct is not null;
begin
  if p_user_key is null or btrim(p_user_key) = '' then
    raise exception '사용자 번호가 없습니다';
  end if;

  -- 지금까지 연속으로 몇 번 맞혔는지, 다음에 언제 보기로 했는지.
  -- 처음 보는 단어면 줄이 없어서 둘 다 null 이 됩니다.
  select coalesce((meta ->> 'streak')::integer, 0), due_at
    into old_streak, old_due
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

  elsif p_correct is false then
    -- 틀렸으면 연속 기록은 처음으로. 3분 뒤부터 다시 나올 수 있습니다.
    -- 0분으로 두면 방금 틀린 단어만 계속 나와서 새 단어를 못 만납니다.
    new_streak := 0;
    gap := interval '3 minutes';

  elsif p_status = 'known' then
    -- 손으로 '외웠어요'. 연속 기록은 건드리지 않고 하루 뒤에 확인합니다.
    new_streak := old_streak;
    gap := interval '1 day';

  else
    -- 손으로 '아직이요'. 모른다고 직접 말한 것이니 연속 기록을 처음으로 되돌립니다.
    new_streak := 0;
    gap := interval '3 minutes';
  end if;

  next_due := now() + gap;

  -- 손으로 '외웠어요' 를 눌렀는데 이미 더 뒤로 잡혀 있으면, 그 날짜를 지킵니다.
  if not from_quiz and p_status = 'known' and old_due is not null and old_due > next_due then
    next_due := old_due;
  end if;

  insert into public.progress as pr
    (user_key, word_id, status, seen_count, correct_count, wrong_count,
     last_seen_at, due_at, meta)
  values (
    p_user_key,
    p_word_id,
    p_status,
    case when from_quiz then 1 else 0 end,
    case when p_correct is true  then 1 else 0 end,
    case when p_correct is false then 1 else 0 end,
    now(),
    next_due,
    jsonb_build_object('streak', new_streak)
  )
  on conflict (user_key, word_id) do update set
    status        = excluded.status,
    seen_count    = pr.seen_count + case when from_quiz then 1 else 0 end,
    correct_count = pr.correct_count + case when p_correct is true  then 1 else 0 end,
    wrong_count   = pr.wrong_count  + case when p_correct is false then 1 else 0 end,
    last_seen_at  = now(),
    due_at        = next_due,
    meta          = pr.meta || jsonb_build_object('streak', new_streak)
  returning * into result;

  return result;
end;
$$;

comment on function public.mark_word(text, text, text, boolean) is
  '학습 상태를 저장하고 다음에 볼 날짜를 정합니다. 퀴즈로 맞히면 간격이 늘고, 손으로 표시하면 하루 뒤입니다';
