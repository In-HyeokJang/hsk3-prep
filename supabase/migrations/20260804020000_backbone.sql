-- ============================================================
--  마이그레이션 2 · 973단어 전체를 담을 수 있게 넓히기
--
--  왜 필요한가:
--    공식 목록 973개의 한자·병음·품사는 지금 바로 다 넣을 수 있습니다.
--    그런데 한국어 뜻과 예문은 사람이 써야 해서 시간이 걸려요.
--
--    그래서 "한자는 있는데 한국어 뜻은 아직" 인 상태를 허용합니다.
--    화면에는 뜻이 준비된 단어만 보여주면 됩니다.
-- ============================================================


-- 1. 한국어 뜻이 아직 없어도 넣을 수 있게
alter table public.words alter column meaning_ko drop not null;

comment on column public.words.meaning_ko is
  '한국어 뜻. 비어 있으면 아직 안 쓴 단어. 화면에는 채워진 것만 보여준다';


-- 2. 빈도 순위
--    숫자가 작을수록 자주 쓰는 단어입니다.
--    "출퇴근 10분" 에 어떤 단어부터 넣을지 정하는 기준이 됩니다.
alter table public.words add column if not exists frequency integer;

comment on column public.words.frequency is
  '중국어 말뭉치 빈도 순위. 작을수록 흔한 말. 어떤 단어부터 공부할지 정하는 데 씁니다';

create index if not exists words_frequency_idx on public.words (frequency nulls last);


-- 3. meaning_en 은 참고용입니다
comment on column public.words.meaning_en is
  '영어 뜻(사전에서 가져옴). 한국어 뜻을 쓸 때 참고하는 용도. 화면에 보여주지 않습니다';


-- 4. 준비된 단어만 세는 보기
--    "973개 중 몇 개가 공부할 수 있는 상태인가" 를 한 줄로 봅니다.
drop view if exists public.v_progress_summary;
create view public.v_progress_summary
with (security_invoker = true)
as
select
  count(*)                                                as total,
  count(*) filter (where meaning_ko is not null)          as ready,
  count(*) filter (where verified)                        as verified,
  (select count(*) from public.examples)                  as examples
from public.words;

comment on view public.v_progress_summary is '자료가 얼마나 준비됐는지 한 줄로';


-- 5. v_words 는 뜻이 준비된 단어만 보여줍니다
--    화면에서 "뜻 없음" 이 섞여 나오면 공부에 방해가 됩니다.
--    아직 안 쓴 단어를 보고 싶으면 words 표를 직접 보면 됩니다.
-- 보기에 frequency 칸이 늘어나므로, 이 보기를 반환하는 함수들도 같이 다시 만들어야 합니다.
-- cascade 로 딸린 것을 함께 지우고, 뒤쪽 마이그레이션이 다시 만듭니다.
-- (자세한 이유는 마이그레이션 1의 같은 자리에 적어뒀습니다)
drop view if exists public.v_words cascade;
create view public.v_words
with (security_invoker = true)
as
select
  w.id,
  w.hanzi,
  w.pinyin,
  w.pinyin_plain,
  w.pos,
  w.meaning_ko,
  w.hsk_level,
  w.topic,
  w.tags,
  w.frequency,
  w.audio_url,
  w.verified,
  e.zh      as example_zh,
  e.pinyin  as example_pinyin,
  e.ko      as example_ko
from public.words w
left join public.examples e
  on e.word_id = w.id and e.seq = 1
where w.meaning_ko is not null;

comment on view public.v_words is
  '단어 + 대표 예문. 한국어 뜻이 준비된 것만 나옵니다. 화면에서는 이것만 읽으면 됩니다';


-- 6. daily_words 도 빈도를 반영합니다
--    같은 조건이면 자주 쓰는 단어를 먼저 보여줍니다.
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
    and coalesce(p.status, 'new') <> 'known'
  order by
    case when p.due_at is not null and p.due_at <= now() then 0 else 1 end,
    p.wrong_count desc nulls last,
    v.frequency asc nulls last,
    v.id
  limit greatest(p_limit, 1);
$$;

comment on function public.daily_words(text, integer, smallint) is
  '아직 안 외운 단어를 골라줍니다. 다시 볼 때가 된 것 → 자주 틀린 것 → 자주 쓰는 것 순서';
