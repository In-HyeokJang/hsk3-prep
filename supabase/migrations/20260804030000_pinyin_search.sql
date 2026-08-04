-- ============================================================
--  마이그레이션 3 · 병음 검색을 실제로 쓸 수 있게
--
--  왜 필요한가:
--    973개를 다 넣고 보니 두 글자 이상인 단어의 병음에 띄어쓰기가 있었습니다.
--      电子邮件  →  "diànzǐ yóujiàn"  →  검색용 "dianzi youjian"
--
--    검색창에 "dianziyoujian" 이라고 붙여 치면 안 찾힙니다.
--    사람은 보통 붙여 치는데 말이죠.
--
--    그리고 공식 목록에는 이런 항목도 있습니다.
--      初（初一）   化（现代化）   …极了
--    괄호와 말줄임표가 그대로 검색용 값에 남아 있었습니다.
--
--  고치는 법:
--    영문자와 숫자만 남기고 전부 뗍니다.
--      "diànzǐ yóujiàn"  →  "dianziyoujian"
--      "chū (chūyī)"     →  "chuchuyi"
--
--    화면에서 검색할 때도 사용자가 친 글자에서 같은 방식으로 떼면
--    띄어 치든 붙여 치든 다 찾힙니다.
-- ============================================================


-- 보기와 함수가 이 칸에 기대고 있어서 먼저 치웁니다. 아래에서 다시 만듭니다.
-- (cascade 를 쓰는 이유는 마이그레이션 1의 같은 자리에 적어뒀습니다)
drop view if exists public.v_words cascade;

-- 생성 칸은 식을 바꿀 수 없어서 지웠다 다시 만듭니다.
-- 자동으로 계산되는 값이라 지워도 잃는 게 없습니다.
alter table public.words drop column if exists pinyin_plain;

alter table public.words add column pinyin_plain text
  generated always as (
    regexp_replace(
      translate(
        lower(pinyin),
        'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü',
        'aaaaeeeeiiiioooouuuuuuuuu'
      ),
      '[^a-z0-9]', '', 'g'    -- 띄어쓰기 · 아포스트로피 · 괄호 · 말줄임표 전부 제거
    )
  ) stored;

comment on column public.words.pinyin_plain is
  '성조·띄어쓰기·기호를 뗀 검색용 병음. 화면에서 검색할 때도 사용자 입력을 같은 방식으로 떼서 비교할 것';

create index if not exists words_plain_idx on public.words (pinyin_plain);


-- 보기 다시 만들기 (내용은 마이그레이션 2와 같습니다)
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


-- 함수 다시 만들기
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


-- ── 검색 함수도 하나 만들어둡니다 ────────────────────────────
--    화면에서 "띄어쓰기 떼고 비교" 를 매번 짜지 않아도 되게.
--
--    앱에서 부르는 법:
--      supabase.rpc('search_words', { p_q: '결정' })
--      supabase.rpc('search_words', { p_q: 'dianzi youjian' })
--
--    한국어 뜻으로도, 병음으로도, 한자로도 찾힙니다.

create or replace function public.search_words(
  p_q     text,
  p_limit integer default 30
)
returns setof public.v_words
language sql
stable
security invoker
as $$
  select v.*
  from public.v_words v
  where p_q is not null and btrim(p_q) <> ''
    and (
      v.hanzi like '%' || p_q || '%'
      or v.meaning_ko like '%' || p_q || '%'
      or v.pinyin_plain like
         regexp_replace(
           translate(lower(p_q),
             'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü',
             'aaaaeeeeiiiioooouuuuuuuuu'),
           '[^a-z0-9]', '', 'g') || '%'
    )
  order by v.frequency asc nulls last, v.id
  limit greatest(p_limit, 1);
$$;

comment on function public.search_words(text, integer) is
  '한자·한국어 뜻·병음 아무거나로 검색. 병음은 성조와 띄어쓰기를 무시합니다';
