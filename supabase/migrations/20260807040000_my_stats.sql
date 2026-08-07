-- ============================================================
--  마이그레이션 20 · 진도 화면에 쓸 숫자를 한 번에 세어줍니다
--
--  무엇이 문제였나:
--    seen_count · correct_count · wrong_count · due_at · attempts 를
--    다 저장하면서 화면에는 막대 하나만 보여줬습니다.
--
--  왜 서버에서 세나 (화면에서 계산하지 않고):
--    · '오늘' 과 '며칠 연속' 은 날짜 계산이라 시간대를 잘못 잡으면 조용히 틀립니다.
--      서버는 UTC 라서 한국 시각으로 새벽 9시 전까지 '어제' 가 됩니다.
--      한 곳에서 한국 시각(Asia/Seoul)으로 못박아 둡니다.
--    · attempts 는 계속 쌓입니다. 통째로 받아와서 브라우저에서 세면
--      쓸수록 느려집니다. 세는 일은 서버가 훨씬 잘합니다.
--
--  ★ '다시 볼 것' 은 daily_words(마이그레이션 15)와 같은 규칙이어야 합니다.
--    화면이 "복습 5개" 라고 했는데 학습을 눌렀더니 다른 게 나오면 안 됩니다.
--    아직 안 본 단어는 빼고, 볼 시각이 지난 것만 셉니다.
--
--  ★ 몇 번을 돌려도 같습니다.
-- ============================================================

create or replace function public.my_stats()
returns table (
  today_total    integer,   -- 오늘 푼 문제 수
  today_correct  integer,   -- 그중 맞힌 수
  streak_days    integer,   -- 며칠 연속 했나
  due_now        integer,   -- 지금 다시 볼 때가 된 단어 수
  new_count      integer,   -- 아직 한 번도 안 본 단어
  learning_count integer,   -- 배우는 중 (모름 · 익히는 중)
  known_count    integer    -- 외운 것
)
language plpgsql
stable
security invoker
as $$
declare
  me       uuid := auth.uid();
  v_today  date;
  v_anchor date;
begin
  if me is null then
    raise exception '로그인이 필요합니다';
  end if;

  -- 한국 시각 기준의 오늘. 서버는 UTC 라서 이걸 안 하면
  -- 밤 9시에 푼 것이 '내일' 로 넘어가 연속 기록이 끊긴 것처럼 보입니다.
  v_today := (now() at time zone 'Asia/Seoul')::date;

  -- 오늘 푼 것
  select count(*)::integer,
         count(*) filter (where is_correct)::integer
    into today_total, today_correct
    from public.attempts
   where user_key = me::text
     and (created_at at time zone 'Asia/Seoul')::date = v_today;

  -- 며칠 연속 했나.
  --
  -- 오늘 아직 안 풀었으면 어제를 기준으로 셉니다.
  -- 아침에 열었을 때 어제까지의 기록이 0으로 보이면,
  -- 이어온 것이 사라진 것처럼 느껴져서 그날로 그만두게 됩니다.
  -- 어제도 안 했으면 그때는 0이 맞습니다.
  with days as (
    select distinct (created_at at time zone 'Asia/Seoul')::date as d
      from public.attempts
     where user_key = me::text
  )
  select case
           when exists (select 1 from days where d = v_today)     then v_today
           when exists (select 1 from days where d = v_today - 1) then v_today - 1
         end
    into v_anchor;

  if v_anchor is null then
    streak_days := 0;
  else
    -- 기준 날부터 하루씩 거슬러 올라가며 끊기지 않은 만큼만 셉니다.
    -- 날짜에 번호를 매겨서 "기준날 - (번호-1)" 과 같은 동안이 이어진 구간입니다.
    with days as (
      select distinct (created_at at time zone 'Asia/Seoul')::date as d
        from public.attempts
       where user_key = me::text
    ),
    lined as (
      select d, row_number() over (order by d desc) as rn
        from days
       where d <= v_anchor
    )
    select count(*)::integer into streak_days
      from lined
     where d = v_anchor - (rn - 1)::integer;
  end if;

  -- 지금 다시 볼 때가 된 단어.
  -- daily_words 와 같은 규칙이되, 한 번도 안 본 단어는 뺍니다 —
  -- 그건 '복습' 이 아니라 '새로 배우기' 라서 따로 세야 뜻이 통합니다.
  select count(*)::integer
    into due_now
    from public.progress
   where user_key = me::text
     and (due_at is null or due_at <= now());

  -- 상태별. 분모는 공식 3급 전체(hsk_level = 3)입니다.
  select count(*) filter (where p.word_id is null)::integer,
         count(*) filter (where p.status in ('unknown', 'learning'))::integer,
         count(*) filter (where p.status = 'known')::integer
    into new_count, learning_count, known_count
    from public.words w
    left join public.progress p
      on p.word_id = w.id and p.user_key = me::text
   where w.hsk_level = 3;

  return next;
end;
$$;

comment on function public.my_stats() is
  '진도 화면에 쓸 숫자. 오늘 푼 것 · 연속 일수 · 복습할 것 · 상태별. 날짜는 한국 시각';

grant execute on function public.my_stats() to authenticated;
