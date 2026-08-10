-- ============================================================
--  마이그레이션 21 · 즐겨찾기 별표
--
--  무엇을 만드나:
--    star_word() — 단어에 별표를 켜고 끕니다. progress.meta 안에 넣습니다.
--
--  ★ 별표는 복습 일정을 건드리면 안 됩니다.
--    별표는 "나중에 다시 보고 싶다" 는 표시일 뿐입니다.
--    누른다고 다음에 볼 날짜가 당겨지거나 밀리면, 표시를 할수록
--    애써 만든 일정이 망가집니다.
--
--  그런데 그냥 넣으면 일정이 바뀝니다 — 여기가 이 마이그레이션의 핵심입니다.
--
--    한 번도 안 본 단어에 별표를 누르면 progress 에 **줄이 새로 생깁니다.**
--    그 줄은 due_at 이 비어 있는데, 지금 daily_words 는
--
--      · 줄이 없으면          → '새 단어' 무리로 보내 빈도순으로 세웁니다
--      · 줄이 있고 due_at 이 비었으면 → '복습' 무리에 넣고 nulls first 로 **맨 앞**에 둡니다
--
--    그래서 별표만 눌렀을 뿐인데 그 단어가 오늘의 단어 1번으로 튀어나옵니다.
--
--    고치는 방향: **due_at 이 비었다는 것은 '아직 일정이 없다' 는 뜻**입니다.
--    '제일 오래 밀린 것' 이 아니라 '아직 안 본 것' 과 같이 다뤄야 맞습니다.
--    daily_words 를 그렇게 고칩니다. 이 기능이 없던 때 저장된 옛 줄들도
--    같은 이유로 이 쪽이 맞습니다.
--
--  my_stats 도 같이 고칩니다:
--    별표만 누른 단어는 status 가 'new' 인 줄로 남습니다.
--    지금 my_stats 는 '안 본 것' 을 "줄이 아예 없는 것" 으로만 세서,
--    별표를 누르는 순간 세 칸의 합이 973에서 줄어듭니다.
--    'new' 인 줄도 안 본 것으로 셉니다.
--
--  ★ 이 파일이 star_word · daily_words · my_stats 의 최종 정의입니다.
--  ★ 몇 번을 돌려도 같습니다.
-- ============================================================


-- ------------------------------------------------------------
-- 1. 별표 켜고 끄기
-- ------------------------------------------------------------
--
-- 왜 함수로 만드나:
--   진도 줄을 직접 고치게 두면 별표를 넣으면서 due_at 이나 status 를
--   같이 건드릴 수 있습니다. 여기서는 meta 의 star 하나만 바꿉니다.
--
--   meta 를 통째로 덮어쓰지 않고 || 로 얹습니다.
--   덮어쓰면 같이 들어 있는 streak(연속 정답 횟수)가 사라집니다.
--
-- 돌려주는 값: 바뀐 진도 줄

create or replace function public.star_word(
  p_word_id text,
  p_on      boolean
)
returns public.progress
language plpgsql
security invoker
as $$
declare
  me     uuid := auth.uid();
  result public.progress;
begin
  if me is null then
    raise exception '로그인이 필요합니다';
  end if;

  insert into public.progress as pr
    (user_key, word_id, status, meta)
  values
    (me::text, p_word_id, 'new', jsonb_build_object('star', p_on))
  on conflict (user_key, word_id) do update set
    -- ★ meta 말고는 아무것도 안 건드립니다.
    --   status · due_at · seen_count · last_seen_at 은 그대로입니다.
    meta = pr.meta || jsonb_build_object('star', p_on)
  returning * into result;

  return result;
end;
$$;

comment on function public.star_word(text, boolean) is
  '즐겨찾기 별표를 켜고 끕니다. 복습 일정(due_at)과 상태는 건드리지 않습니다';

grant execute on function public.star_word(text, boolean) to authenticated;


-- ------------------------------------------------------------
-- 2. daily_words — 일정이 없는 줄은 '안 본 단어' 로
-- ------------------------------------------------------------
--
-- 마이그레이션 15에서 정한 것을 그대로 두고, 순서만 고칩니다.
--   · 무엇이 나오는가 → 그대로 (안 본 것 · 일정 없는 것 · 때가 된 것)
--   · 어떤 순서인가   → due_at 이 비어 있으면 '복습' 이 아니라 '새 단어' 쪽으로
--
-- ★ 이 파일이 daily_words 의 최종 정의입니다 (마이그레이션 15를 대신함).

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
      -- 줄은 있지만 다시 볼 시각이 정해지지 않은 단어
      -- (별표만 눌렀거나, 이 기능이 없던 때 저장된 줄)
      or p.due_at is null
      -- 다시 볼 시각이 지난 단어
      or p.due_at <= now()
    )
  order by
    -- 복습할 때가 된 것을 먼저.
    -- ★ 시각이 아예 없는 줄은 복습이 아니라 새 단어 쪽입니다.
    --   nulls first 로 두면 별표만 누른 단어가 오늘의 1번으로 튀어나옵니다.
    case when p.due_at is null then 1 else 0 end,
    -- 그중에서도 오래 기다린 것부터
    p.due_at asc,
    -- 새 단어는 자주 쓰는 것부터
    v.frequency asc nulls last,
    v.id
  limit greatest(p_limit, 1);
$$;

comment on function public.daily_words(text, integer, smallint) is
  '오늘 볼 단어. 때가 된 복습 → 오래 기다린 것 → 자주 쓰는 새 단어 순서. 시각이 없는 줄은 새 단어로 봅니다';


-- ------------------------------------------------------------
-- 3. my_stats — 'new' 인 줄도 안 본 것으로
-- ------------------------------------------------------------
--
-- 마이그레이션 20과 같고, 마지막 셈 하나만 고쳤습니다.
-- ★ 이 파일이 my_stats 의 최종 정의입니다.

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
  -- ★ 시각이 없는 줄은 빼야 합니다. 별표만 누른 단어가 여기 세어지면
  --   "오늘 복습할 단어 1개" 라고 해놓고 학습에서는 안 나옵니다.
  select count(*)::integer
    into due_now
    from public.progress
   where user_key = me::text
     and due_at is not null
     and due_at <= now();

  -- 상태별. 분모는 공식 3급 전체(hsk_level = 3)입니다.
  -- ★ 줄이 없는 것과 'new' 인 줄을 함께 셉니다.
  --   별표만 누르면 status 가 'new' 인 줄이 생기는데, 줄이 없는 것만 세면
  --   별표를 누르는 순간 세 칸의 합이 973에서 줄어듭니다.
  select count(*) filter (where p.word_id is null or p.status = 'new')::integer,
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
