-- ============================================================
--  HSK 단어 사이트 · 스키마 v2
--  Supabase → 왼쪽 메뉴 SQL Editor → 통째로 붙여넣고 Run
--
--  몇 번을 실행해도 결과가 같습니다 (멱등).
--
--  표 4개 + 보기 1개 + 함수 1개
--    words     단어          ← 지금 100줄
--    examples  예문          ← 단어 하나에 여러 개 가능
--    progress  내 진도       ← 사람마다 단어마다 한 줄
--    attempts  푼 기록       ← 게임·통계용. 계속 쌓임
--    v_words   보기          ← 단어 + 대표 예문을 한 줄로 (앱은 이것만 봄)
--    daily_words()  함수     ← "오늘의 10단어" 를 서버가 골라줌
-- ============================================================


-- ------------------------------------------------------------
-- 1. words · 단어
-- ------------------------------------------------------------
--
-- 기본 키를 hanzi 가 아니라 id 로 잡은 이유:
--   공식 목록에 같은 한자가 두 번 나옵니다.
--   把(개사) / 把(양사), 背(bēi 업다) / 背(bèi 등)
--   한자를 키로 잡으면 이 단어들이 에러 없이 조용히 서로를 덮어씁니다.
--
-- id 는 'L3-0001' 형식입니다. 공식 목록 번호라 바뀌지 않습니다.
--   HSK 4급을 추가하면 'L4-0001'
--   내가 직접 넣는 단어는 'X-0001' 처럼 쓰면 됩니다.

create table if not exists public.words (
  id            text        primary key,
  hanzi         text        not null,
  pinyin        text        not null,

  -- 성조 기호를 뗀 검색용 병음. 자동으로 채워집니다.
  --   'juédìng' → 'jueding',  "bǎo'ān" → 'baoan'
  -- 검색창에 성조 없이 쳐도 찾히게 하려고 둡니다.
  pinyin_plain  text        generated always as (
                              translate(
                                lower(pinyin),
                                'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü''',
                                'aaaaeeeeiiiioooouuuuuuuuu'
                              )
                            ) stored,

  pos           text,
  meaning_ko    text        not null,
  meaning_en    text,

  hsk_level     smallint,                          -- 1~7. null 이면 HSK 밖 단어
  hsk_edition   text        not null default '3.0',-- '3.0' | '2.0'

  topic         text,
  tags          text[]      not null default '{}', -- 자유 분류. 나중에 뭘 넣든
  audio_url     text,                              -- 발음 파일. 5단계에 씁니다

  verified      boolean     not null default false,-- 사람이 검수했나
  verified_at   timestamptz,
  note          text,
  meta          jsonb       not null default '{}', -- 예상 못 한 게 생겼을 때 쓰는 자리

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint words_level_range check (hsk_level is null or hsk_level between 1 and 7)
);

comment on table  public.words              is 'HSK 단어. id 는 공식 목록 번호(L3-0001)';
comment on column public.words.pinyin_plain is '성조·아포스트로피를 뗀 검색용. 자동 생성';
comment on column public.words.verified     is '사람이 뜻·예문을 확인했는지. 화면에는 이걸로 걸러도 됨';
comment on column public.words.meta         is '칸을 새로 만들기 전에 여기에 먼저 넣어보는 자리';

create index if not exists words_level_idx  on public.words (hsk_level, id);
create index if not exists words_topic_idx  on public.words (topic);
create index if not exists words_plain_idx  on public.words (pinyin_plain);
create index if not exists words_tags_idx   on public.words using gin (tags);


-- ------------------------------------------------------------
-- 2. examples · 예문
-- ------------------------------------------------------------
--
-- 왜 words 안에 넣지 않고 표를 따로 뒀나:
--   지금은 단어 하나에 예문 하나지만,
--   1시간용으로 키우면 단어 하나에 예문 서너 개가 필요해집니다.
--   그때 words 에 example_zh_2, example_zh_3 을 붙이기 시작하면 손을 못 씁니다.
--
--   대신 앱이 복잡해지지 않도록 아래에 v_words 라는 보기를 만들어뒀습니다.
--   화면에서는 표를 두 개 붙일 필요 없이 v_words 하나만 읽으면 됩니다.

create table if not exists public.examples (
  id          uuid        primary key default gen_random_uuid(),
  word_id     text        not null references public.words(id) on delete cascade,
  seq         smallint    not null default 1,       -- 1번이 대표 예문

  zh          text        not null,
  pinyin      text,
  ko          text,

  verified    boolean     not null default false,
  meta        jsonb       not null default '{}',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint examples_word_seq_unique unique (word_id, seq)   -- ★ 멱등성
);

comment on table  public.examples     is '예문. 단어 하나에 여러 개 가능. seq=1 이 대표';
comment on column public.examples.seq is '표시 순서. 같은 단어에 같은 번호를 두 번 못 넣습니다';

create index if not exists examples_word_idx on public.examples (word_id, seq);


-- ------------------------------------------------------------
-- 3. progress · 내 진도
-- ------------------------------------------------------------
--
-- 로그인을 만들지 않습니다.
-- 브라우저에 임시 번호(user_key)를 하나 저장해두고 그걸로 구분합니다.
--
-- unique (user_key, word_id) 가 이 표의 핵심입니다.
--   "외웠어요" 를 열 번 눌러도 줄은 하나입니다.
--   앱에서는 insert 가 아니라 upsert 로 넣습니다.

create table if not exists public.progress (
  id             uuid        primary key default gen_random_uuid(),
  user_key       text        not null,
  word_id        text        not null references public.words(id) on delete cascade,

  status         text        not null default 'new',
  seen_count     integer     not null default 0,
  correct_count  integer     not null default 0,
  wrong_count    integer     not null default 0,

  last_seen_at   timestamptz,
  due_at         timestamptz,                       -- 다음에 다시 볼 시각. 간격 반복용
  meta           jsonb       not null default '{}',

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint progress_user_word_unique unique (user_key, word_id),
  constraint progress_status_check
    check (status in ('new', 'unknown', 'learning', 'known'))
);

comment on column public.progress.user_key is '브라우저에 저장한 임시 번호(UUID). 로그인 대신';
comment on column public.progress.status   is 'new 처음 / unknown 모름 / learning 익히는 중 / known 외움';
comment on column public.progress.due_at   is '"3일 뒤에 다시 보여줘" 를 만들 때 씁니다. 지금은 비워둬도 됨';

create index if not exists progress_user_idx     on public.progress (user_key, status);
create index if not exists progress_user_due_idx on public.progress (user_key, due_at);


-- ------------------------------------------------------------
-- 4. attempts · 푼 기록 (게임·통계용)
-- ------------------------------------------------------------
--
-- progress 와 다른 점:
--   progress 는 한 줄만 남기고, attempts 는 풀 때마다 쌓입니다.
--   "연속 정답", "자주 틀리는 단어", "평균 반응 속도" 는 쌓인 기록이 있어야 나옵니다.
--
-- 지금 안 써도 표는 만들어둡니다. 나중에 만들면 그 전 기록이 전부 비니까요.

create table if not exists public.attempts (
  id           uuid        primary key default gen_random_uuid(),
  user_key     text        not null,
  word_id      text        not null references public.words(id) on delete cascade,

  quiz_type    text        not null default 'meaning',
  is_correct   boolean     not null,
  answered_ms  integer,                             -- 몇 밀리초 만에 답했는지
  meta         jsonb       not null default '{}',

  created_at   timestamptz not null default now(),

  constraint attempts_quiz_type_check
    check (quiz_type in ('meaning', 'pinyin', 'hanzi', 'blank', 'listen', 'speak'))
);

comment on column public.attempts.answered_ms is '처음부터 넣어두세요. 나중에 추가하면 과거 기록이 전부 빕니다';

create index if not exists attempts_user_time_idx on public.attempts (user_key, created_at desc);
create index if not exists attempts_word_idx      on public.attempts (word_id);


-- ------------------------------------------------------------
-- 5. updated_at 자동 갱신
-- ------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists words_touch    on public.words;
create trigger words_touch    before update on public.words
  for each row execute function public.touch_updated_at();

drop trigger if exists examples_touch on public.examples;
create trigger examples_touch before update on public.examples
  for each row execute function public.touch_updated_at();

drop trigger if exists progress_touch on public.progress;
create trigger progress_touch before update on public.progress
  for each row execute function public.touch_updated_at();


-- ------------------------------------------------------------
-- 6. v_words · 앱이 읽을 보기 하나
-- ------------------------------------------------------------
--
-- 표를 나눠놓으면 보통 화면에서 둘을 붙여 읽어야 해서 복잡해집니다.
-- 그걸 대신 해주는 게 이 보기(view)입니다.
--
-- 앱에서는 words 도 examples 도 아니고 v_words 하나만 읽으면 됩니다.
-- 나중에 예문이 여러 개가 돼도 이 보기는 그대로 대표 예문(seq=1)만 줍니다.
--
-- security_invoker = true 가 중요합니다.
--   이게 없으면 보기가 아래 표들의 RLS를 건너뛰어 버립니다.

-- ⚠ cascade 를 쓰는 이유 (이거 때문에 두 번 막혔습니다)
--
--   daily_words 같은 함수는 returns setof public.v_words 라 이 보기에 의존합니다.
--   그래서 그냥 drop view 하면 두 번째 실행부터 이렇게 멈춥니다.
--     "cannot drop view v_words because other objects depend on it"
--
--   의존하는 함수를 하나씩 나열해서 먼저 지우는 방법도 있지만,
--   함수를 새로 만들 때마다 이 줄을 고쳐야 해서 계속 깨집니다. (실제로 그랬습니다)
--
--   cascade 는 딸린 것을 같이 지웁니다. 보통은 위험한 선택이지만
--   여기서는 안전합니다 — db:push 가 매번 마이그레이션을 처음부터 전부 다시 실행하므로,
--   여기서 딸려 지워진 함수는 뒤쪽 마이그레이션이 다시 만들어줍니다.
--
--   ★ 그래서 규칙이 하나 생깁니다.
--     함수는 반드시 "마지막에 만드는 마이그레이션" 에 최종 정의가 있어야 합니다.
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
  w.audio_url,
  w.verified,
  e.zh      as example_zh,
  e.pinyin  as example_pinyin,
  e.ko      as example_ko
from public.words w
left join public.examples e
  on e.word_id = w.id and e.seq = 1;

comment on view public.v_words is '단어 + 대표 예문. 화면에서는 이것만 읽으면 됩니다';


-- ------------------------------------------------------------
-- 7. daily_words() · 오늘의 단어를 서버가 골라주기
-- ------------------------------------------------------------
--
-- "아직 안 외운 것 중에서 10개" 를 화면에서 계산하려면 코드가 꽤 붙습니다.
-- 그걸 여기서 한 번에 처리합니다.
--
-- 앱에서 부르는 법:
--   supabase.rpc('daily_words', { p_user_key: myKey, p_limit: 10 })
--
-- 3회차에는 안 쓰셔도 됩니다. 4회차에 진도를 붙일 때 쓰세요.

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
    v.id
  limit greatest(p_limit, 1);
$$;

comment on function public.daily_words(text, integer, smallint) is
  '아직 안 외운 단어를 골라줍니다. 다시 볼 때가 된 것 → 자주 틀린 것 → 목록 순서';


-- ------------------------------------------------------------
-- 8. RLS · 누가 뭘 할 수 있나
-- ------------------------------------------------------------
--
-- 브라우저에서 Supabase를 직접 부르는 구조라, anon 키가 사이트에 그대로 박힙니다.
-- 그래서 "무엇을 못 하게 할지" 를 여기서 정해둬야 합니다.

alter table public.words    enable row level security;
alter table public.examples enable row level security;
alter table public.progress enable row level security;
alter table public.attempts enable row level security;

-- 자료(words, examples) : 누구나 읽기만. 고치는 건 SQL Editor에서만
drop policy if exists "words 읽기" on public.words;
create policy "words 읽기" on public.words
  for select to anon, authenticated using (true);

drop policy if exists "examples 읽기" on public.examples;
create policy "examples 읽기" on public.examples
  for select to anon, authenticated using (true);

-- progress : 읽기·추가·수정 허용, 삭제는 아무도 못 함
drop policy if exists "progress 읽기" on public.progress;
create policy "progress 읽기" on public.progress
  for select to anon, authenticated using (true);

drop policy if exists "progress 추가" on public.progress;
create policy "progress 추가" on public.progress
  for insert to anon, authenticated with check (true);

drop policy if exists "progress 수정" on public.progress;
create policy "progress 수정" on public.progress
  for update to anon, authenticated using (true) with check (true);

-- attempts : 쌓기만. 고치거나 지우지 못함
drop policy if exists "attempts 읽기" on public.attempts;
create policy "attempts 읽기" on public.attempts
  for select to anon, authenticated using (true);

drop policy if exists "attempts 추가" on public.attempts;
create policy "attempts 추가" on public.attempts
  for insert to anon, authenticated with check (true);

-- delete 정책을 어디에도 만들지 않았습니다 = 삭제가 막힙니다. 일부러 그런 겁니다.


-- ============================================================
--  ⚠️  지금 상태의 한계
--
--  로그인이 없어서 "이 줄이 진짜 이 사람 것인가" 를 서버가 확인할 수 없습니다.
--  user_key 가 UUID라 남의 번호를 알아맞히기는 사실상 불가능하고,
--  progress 에는 이름도 이메일도 없습니다. 남는 건 "어떤 번호가 어떤 단어를
--  외웠다" 뿐이라, 혼자 쓰는 학습 기록으로는 감수할 만한 수준입니다.
--
--  나중에 Supabase Auth 의 익명 로그인을 켜면 아래 두 줄로 조일 수 있습니다.
--  (표 구조는 그대로 두고 정책만 바꾸면 됩니다)
--
--    drop policy "progress 읽기" on public.progress;
--    create policy "내 진도만 읽기" on public.progress
--      for select to authenticated using (auth.uid()::text = user_key);
-- ============================================================
