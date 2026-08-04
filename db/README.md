# 데이터베이스 준비하기

**세 줄로 끝납니다.** `.env.local` 에 접속 문자열 하나만 넣으시면 돼요.

```
npm install
npm run db:all
```

---

## 먼저 · anon 키로는 표를 못 만듭니다

이걸 알고 시작하셔야 합니다.

| 열쇠 | 할 수 있는 것 |
|---|---|
| **anon key** | 이미 있는 표를 읽고 쓰기 |
| **DB 접속 문자열** | **표 만들기 · 고치기 · 지우기** |

anon 키는 손님용 열쇠예요. 방에 들어갈 순 있지만 벽을 세울 순 없습니다.
그래서 표를 만들려면 **데이터베이스 비밀번호가 들어간 접속 문자열**이 필요합니다.

---

## 1. `.env.local` 만들기 (3분)

`.env.local.example` 을 복사해서 이름을 `.env.local` 로 바꾸세요.

### 접속 문자열 찾는 곳

**Supabase → 내 프로젝트 → 화면 위쪽 `Connect` 버튼 → Session pooler 의 URI**

이렇게 생겼습니다.

```
postgresql://postgres.abcdefghijklmn:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
```

`[YOUR-PASSWORD]` 자리에 **프로젝트 만들 때 정한 비밀번호**를 넣으시면 됩니다.

`.env.local` 에는 이렇게 들어갑니다.

```
SUPABASE_DB_URL=postgresql://postgres.abcdefghijklmn:내비밀번호@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
```

:::caution[Direct connection 말고 Session pooler 를 고르세요]
Direct connection 은 IPv6만 되는 경우가 있어서, 한국 가정용 인터넷에서 연결이 안 될 수 있습니다.
:::

:::caution[비밀번호에 특수문자가 있으면]
`@` `:` `/` `?` `#` 이 들어 있으면 주소가 잘못 읽힙니다.

**Settings → Database 에서 영문+숫자로 새로 정하시는 편이 빠릅니다.** 비밀번호를 잊으셨을 때도 여기서 바꾸시면 돼요.
:::

:::danger[비밀번호를 잊으셨으면]
찾을 수는 없고 **새로 정할 수만** 있습니다. Settings → Database → Reset database password.
:::

---

## 2. 실행 (1분)

```
npm install
npm run db:all
```

`db:all` 이 아래 셋을 순서대로 합니다.

| 명령 | 뭘 |
|---|---|
| `npm run db:push` | `supabase/migrations/` 의 SQL을 실행해 표를 만듭니다 |
| `npm run db:seed` | `data/` 의 CSV를 읽어 단어와 예문을 넣습니다 |
| `npm run db:check` | **제대로 들어갔는지 확인합니다** |

하나씩 따로 돌리셔도 됩니다.

---

## 3. `db:check` 가 보는 것

이 단계가 진짜입니다. "SQL 돌렸으니 됐겠지" 하고 넘어가면 4회차에 원인을 못 찾아요.

- 표 4개와 보기가 다 있는가
- 단어·예문이 몇 줄인가
- **한자가 깨지지 않았는가** ← 제일 중요
- 병음 성조 기호가 살아 있는가
- 검색용 병음(`pinyin_plain`)이 자동으로 채워졌는가
- 권한(RLS)이 켜져 있는가
- `daily_words()` 함수가 실제로 단어를 돌려주는가

문제가 있으면 **무엇을 확인해야 하는지까지** 알려줍니다.

---

## 몇 번을 실행해도 안전합니다

| | 어떻게 |
|---|---|
| `db:push` | 마이그레이션이 전부 `if not exists` · `or replace` 로 쓰여 있음 |
| `db:seed` | `on conflict do update` — 있으면 덮어쓰고 없으면 넣기 |

**CSV의 뜻이나 예문을 고친 뒤 `npm run db:seed` 만 다시 돌리면 반영됩니다.** 표를 지울 필요 없어요. 줄이 200개로 늘지도 않습니다.

:::note[`verified` 는 일부러 안 건드립니다]
검수 표시를 해둔 단어가 시드를 다시 돌릴 때 `false` 로 되돌아가면 안 되니까요.
:::

:::note[중간에 실패하면 아무것도 안 들어갑니다]
`db:push` 는 마이그레이션 파일 하나를 통째로 한 트랜잭션에 넣고, `db:seed` 도 전체를 한 트랜잭션으로 처리합니다.

**반쯤 들어간 상태가 생기지 않습니다.** 에러가 나면 실행 전 그대로예요.
:::

---

## 단어를 더 넣을 때

CSV만 만들면 됩니다. **SQL을 따로 만들 필요 없습니다.**

1. `data/words-l3-101-200.csv` 를 만든다 (칸 이름은 기존 파일과 똑같이)
2. `npm run db:seed`

`data/` 안의 `words-*.csv` 를 전부 읽어서 넣습니다. 일부만 넣고 싶으면:

```
npm run db:seed -- 101-200
```

파일 이름에 `101-200` 이 들어간 것만 처리합니다.

:::caution[Supabase 화면의 CSV 업로드는 쓰지 마세요]
편해 보이지만 **멱등하지 않습니다.** 같은 파일을 두 번 올리면 줄이 두 배가 돼요. 그것도 조용히 일어납니다.
:::

---

## 손으로 하고 싶으면 (예비용)

스크립트가 안 되거나, 무슨 SQL이 도는지 눈으로 보고 싶으실 때 쓰세요. 결과는 똑같습니다.

Supabase → SQL Editor 에 **순서대로** 붙여넣고 Run:

1. `supabase/migrations/20260804010000_init_schema.sql`
2. `db/02-seed-words.sql`
3. `db/03-seed-examples.sql`

확인:

```sql
select count(*) from public.words;   -- 100
select id, hanzi, pinyin, pinyin_plain, meaning_ko, example_zh
from public.v_words order by id limit 10;
```

`爱心` / `àixīn` / `aixin` 이 다 멀쩡해야 합니다.

---

## GitHub 연동은 나중에

> "supabase랑 github랑 연동하면 되려나?"

**됩니다. 그리고 이미 준비는 해뒀습니다.**

Supabase의 GitHub 연동은 `supabase/migrations/` 폴더를 보고 푸시할 때마다 자동으로 마이그레이션을 돌립니다. 그래서 스키마를 처음부터 그 폴더에 넣어뒀어요.

**다만 지금 켜지는 마세요.**

| 왜 |
|---|
| 설정하는 데 20분쯤 듭니다. 지금은 `npm run db:all` 이 3초면 끝나요 |
| 자동으로 도니까, 잘못된 마이그레이션도 자동으로 돕니다 |
| 마이그레이션이 여러 개 쌓이고 나서 켜야 값어치가 있습니다 |

**켤 때가 되면** — 자료를 여러 번 늘리고, 스키마도 두세 번 고친 뒤가 좋습니다. 그때는 `attempts` 표에 칸을 하나 추가하는 것도 "파일 만들고 → 커밋 → 푸시" 로 끝나요.

---

## 뭐가 만들어졌나

### 표 4개

| 표 | 뭐가 | 지금 |
|---|---|---|
| `words` | 단어. PK는 `id` (`L3-0001`) | 100줄 |
| `examples` | 예문. 단어 하나에 여러 개 가능 | 100줄 |
| `progress` | 내 진도. 사람마다 단어마다 한 줄 | 0줄 |
| `attempts` | 푼 기록. 풀 때마다 쌓임 | 0줄 |

### 보기 1개 — 이게 핵심입니다

```sql
select * from public.v_words;
```

**앱에서는 `words` 도 `examples` 도 아니고 `v_words` 하나만 읽으면 됩니다.**

예문을 표로 뺀 건 1시간용으로 키우면 단어 하나에 예문이 서너 개 필요해지기 때문인데, 그 복잡함이 화면까지 넘어가지 않게 막아주는 게 이 보기예요.

> 화면 코드는 그대로 두고 데이터만 자란다 — 이게 표를 나눈 이유입니다.

### 함수 1개

```js
supabase.rpc('daily_words', { p_user_key: myKey, p_limit: 10 })
```

아직 안 외운 단어를 골라줍니다. 순서는 **다시 볼 때가 된 것 → 자주 틀린 것 → 목록 순서**.

3회차에는 안 쓰셔도 됩니다. 4회차에 쓰면 화면에서 짤 코드가 확 줄어요.

---

## 앱에서 진도를 저장할 때 · `onConflict` 를 꼭 적으세요

`progress` 에 `unique (user_key, word_id)` 가 걸려 있습니다. **한 사람이 한 단어에 한 줄.**

```js
supabase.from('progress').upsert(
  { user_key: myKey, word_id: 'L3-0001', status: 'known' },
  { onConflict: 'user_key,word_id' }   // ← 이게 없으면 두 번째 클릭에 409
);
```

:::danger[빠뜨리면 반드시 터집니다 — 실제로 확인했습니다]
`progress` 의 기본 키는 `id`(자동 생성 UUID)이고, 겹침을 막는 건 `unique (user_key, word_id)` 입니다. **둘이 다릅니다.**

`onConflict` 가 없으면 Supabase는 기본 키를 기준으로 삼는데, `id` 는 매번 새로 만들어지니 절대 안 겹쳐요. 그래서 그냥 `insert` 처럼 굴다가 `unique` 제약에 걸립니다.

| 어떻게 부르나 | 1번째 | 2번째 | 3번째 | 남는 줄 |
|---|---|---|---|---|
| `onConflict` 없이 | `201` | **`409`** | — | 1 |
| `onConflict: 'user_key,word_id'` | `201` | `200` | `200` | **1** |
:::

---

## 권한 (RLS) 지금 상태

| 표 | 읽기 | 넣기 | 고치기 | 지우기 |
|---|---|---|---|---|
| `words` · `examples` | O | X | X | X |
| `progress` | O | O | O | **X** |
| `attempts` | O | O | **X** | **X** |

- **자료는 읽기 전용.** 사이트에서 단어를 건드릴 일이 없습니다
- **삭제는 전부 막았습니다.** 누가 장난쳐도 기록이 사라지지 않아요
- **`attempts` 는 쌓기만.** 푼 기록을 나중에 고칠 수 있으면 통계가 의미 없어집니다

**실제로 찔러봤습니다.** 사이트가 쓸 publishable 키로 REST를 호출해서 확인한 결과입니다.

| 해본 것 | 응답 | 실제로 |
|---|---|---|
| `v_words` 읽기 | `200` | 잘 읽힘 |
| `words` 에 단어 넣기 | `401` | 막힘 |
| `words` 뜻 고치기 | `204` | **안 바뀜** (100줄·뜻 그대로) |
| `words` · `examples` 지우기 | `204` | **안 지워짐** (100줄 그대로) |
| `progress` 저장 | `201`/`200` | 잘 됨 |
| `progress` 지우기 | `204` | **안 지워짐** |

:::danger[`204` 를 성공으로 읽지 마세요]
권한에 막히면 "거절"이 아니라 **"고칠 수 있는 줄이 0개"** 로 처리됩니다. 그래서 응답만 보면 성공한 것처럼 보여요.

`site-notes.md` 에 적어두신 그 교훈이 그대로입니다 — *"성공을 알리는 기준은 서버가 200을 줬는가가 아니다."* 바꿨다면 **다시 읽어서** 확인하세요.
:::

:::caution[한계]
로그인이 없어서 서버는 "이 줄이 진짜 이 사람 것인가"를 확인할 수 없습니다.

`user_key` 가 UUID라 남의 번호를 알아맞히는 건 사실상 불가능하고, `progress` 에는 이름도 이메일도 없어요. 혼자 쓰는 학습 기록으로는 감수할 만합니다.

나중에 익명 로그인을 켜면 **표는 그대로 두고 정책만** 바꾸면 됩니다. 바꿀 SQL을 마이그레이션 파일 맨 아래에 적어뒀어요.
:::

---

## 처음부터 다시 하고 싶으면

```sql
drop view if exists public.v_words;
drop function if exists public.daily_words(text, integer, smallint);
drop table if exists public.attempts;
drop table if exists public.progress;
drop table if exists public.examples;
drop table if exists public.words;
```

:::danger[학습 기록까지 같이 지워집니다]
`progress` 와 `attempts` 안의 기록이 전부 없어집니다. 되돌릴 수 없어요.

**표 구조만 고치고 싶은 거라면 이걸 쓰지 마세요.** `npm run db:push` 를 그냥 다시 돌리면 됩니다.
:::

---

## 안 될 때

| 증상 | 대개 이것 |
|---|---|
| `SUPABASE_DB_URL 이 없습니다` | `.env.local` 파일 이름 확인. `.env.local.example` 그대로 두면 안 읽힙니다 |
| `password authentication failed` | 비밀번호가 틀렸습니다. Settings → Database 에서 새로 정하세요 |
| `ENOTFOUND` / `ETIMEDOUT` | 주소가 틀렸거나 프로젝트가 일시정지(paused) 상태 |
| `Tenant or user not found` | Session pooler 주소의 `postgres.xxxx` 부분이 잘못됐습니다. Connect 에서 다시 복사 |
| 특수문자 때문에 주소가 이상함 | 비밀번호를 영문+숫자로 바꾸는 게 빠릅니다 |

에러 메시지를 그대로 붙여넣어 주시면 같이 봐드릴게요.
