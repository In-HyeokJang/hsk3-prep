-- ============================================================
--  마이그레이션 19 · 오류·오타 신고
--
--  무엇을 만드나:
--    reports 표 하나와 report_word() 함수 하나.
--    쓰는 사람이 "이 단어 이상해요" 를 눌러두면 여기에 쌓입니다.
--
--  왜 필요한가:
--    한자·병음·품사는 공식 목록 그대로라 믿을 수 있지만,
--    한국어 뜻과 예문 973개는 새로 만든 것이고 사람이 아직 안 봤습니다.
--    혼자 973개를 검수하는 건 사실상 불가능한데,
--    쓰는 사람이 이상한 곳에서 한 번 눌러주면 저절로 모입니다.
--
--    words.verified / examples.verified 칸이 이미 있어서 그대로 맞물립니다.
--    신고가 들어온 단어부터 확인하고 verified 를 켜면 됩니다.
--
--  ★ 함수로만 넣게 합니다 (앱에서 직접 insert 하지 않고):
--    · user_key 를 서버가 auth.uid() 로 정합니다. 남의 번호로 넣을 수 없습니다
--    · "하루에 한 번" 제한을 서버가 겁니다.
--      화면에서만 막으면 브라우저에서 서버를 직접 불러 연타할 수 있습니다.
--      화면에 버튼이 없다는 것은 막았다는 뜻이 아닙니다 (마이그레이션 12에서 겪은 일)
--
--  ★ 몇 번을 돌려도 같습니다.
-- ============================================================


-- ------------------------------------------------------------
-- 1. reports · 신고
-- ------------------------------------------------------------
--
-- 무엇이 이상한지를 종류로 받습니다. 자유롭게 쓰는 칸만 두면
-- 대부분 빈칸으로 들어와서 나중에 뭘 봐야 할지 알 수 없습니다.
--
-- handled 는 내가 확인했는지 표시하는 칸입니다.
-- 화면에는 안 나옵니다 — Supabase 에서 직접 봅니다.

create table if not exists public.reports (
  id          uuid        primary key default gen_random_uuid(),
  user_key    text        not null,
  word_id     text        not null references public.words(id) on delete cascade,

  kind        text        not null,
  note        text,                                  -- 자유롭게 적는 말. 없어도 됩니다

  handled     boolean     not null default false,    -- 내가 확인했나
  handled_at  timestamptz,
  meta        jsonb       not null default '{}',

  created_at  timestamptz not null default now(),

  constraint reports_kind_check
    check (kind in ('meaning', 'example', 'pinyin', 'other'))
);

comment on table  public.reports         is '쓰는 사람이 알려준 이상한 곳. 예문 검수의 출발점';
comment on column public.reports.kind    is 'meaning 뜻 · example 예문 · pinyin 병음/성조 · other 그 밖';
comment on column public.reports.handled is '내가 확인했나. 사이트에는 안 나옵니다';

-- 아직 안 본 것부터 보는 게 이 표를 쓰는 유일한 방법입니다
create index if not exists reports_open_idx
  on public.reports (handled, created_at desc);

create index if not exists reports_word_idx
  on public.reports (word_id);


-- ------------------------------------------------------------
-- 2. 권한 · 규칙
-- ------------------------------------------------------------
--
-- 읽기는 내 것만. 남이 뭘 신고했는지 볼 이유가 없습니다.
-- 넣기는 아무에게도 주지 않습니다 — 아래 함수로만 들어옵니다.
-- 고치기·지우기도 없습니다. handled 는 내가 Supabase 에서 켭니다.

alter table public.reports enable row level security;

drop policy if exists "내 신고 읽기" on public.reports;
create policy "내 신고 읽기" on public.reports
  for select to authenticated
  using (auth.uid()::text = user_key and public.is_active_user());

revoke insert, update, delete on public.reports from anon, authenticated;
grant  select on public.reports to authenticated;


-- ------------------------------------------------------------
-- 3. 신고하기
-- ------------------------------------------------------------
--
-- 같은 단어는 하루에 한 번만 받습니다.
--
-- 왜 넣나: 장난으로 연타하면 표가 같은 줄로 가득 차서,
--   정작 봐야 할 신고를 못 찾게 됩니다. 신고는 많아서 쓸모 있는 게 아니라
--   서로 다른 단어를 가리켜야 쓸모 있습니다.
--
-- 왜 에러를 내나: 조용히 무시하면 화면에서 "접수됐다" 고 말하게 됩니다.
--   눌렀는데 아무 데도 안 남는 게 제일 나쁩니다.
--
-- 돌려주는 값: 새로 만든 신고 번호

create or replace function public.report_word(
  p_word_id text,
  p_kind    text,
  p_note    text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  v_note text := nullif(btrim(p_note), '');
  new_id uuid;
begin
  if me is null then
    raise exception '로그인이 필요합니다';
  end if;

  if not exists (select 1 from public.profiles where user_id = me and is_active) then
    raise exception '탈퇴한 계정입니다';
  end if;

  if not exists (select 1 from public.words where id = p_word_id) then
    raise exception '없는 단어입니다';
  end if;

  if p_kind not in ('meaning', 'example', 'pinyin', 'other') then
    raise exception '무엇이 이상한지를 골라주세요';
  end if;

  -- 너무 긴 글은 잘라서 받습니다. 못 받겠다고 되돌려보내면 쓴 글이 날아갑니다.
  if v_note is not null and length(v_note) > 500 then
    v_note := left(v_note, 500);
  end if;

  if exists (
    select 1 from public.reports
     where user_key = me::text
       and word_id = p_word_id
       and created_at > now() - interval '1 day'
  ) then
    raise exception '이 단어는 이미 알려주셨습니다. 같은 단어는 하루에 한 번만 받습니다';
  end if;

  insert into public.reports (user_key, word_id, kind, note)
  values (me::text, p_word_id, p_kind, v_note)
  returning id into new_id;

  return new_id;
end;
$$;

comment on function public.report_word(text, text, text) is
  '이상한 곳을 알려줍니다. 같은 단어는 하루에 한 번만';

grant execute on function public.report_word(text, text, text) to authenticated;


-- ------------------------------------------------------------
-- 4. 탈퇴하면 신고도 지웁니다
-- ------------------------------------------------------------
--
-- 마이그레이션 11의 withdraw_account 를 다시 만듭니다.
-- 진도와 푼 기록은 지우면서 신고만 남으면, 지웠다고 말한 것이 거짓말이 됩니다.
--
-- ★ 이것이 withdraw_account 의 최종 정의입니다. 고칠 일이 생기면 여기를 봅니다.

create or replace function public.withdraw_account()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me      uuid := auth.uid();
  removed integer;
begin
  if me is null then
    raise exception '로그인이 필요합니다';
  end if;

  if not exists (select 1 from public.profiles where user_id = me and is_active) then
    raise exception '이미 탈퇴한 계정입니다';
  end if;

  delete from public.progress where user_key = me::text;
  get diagnostics removed = row_count;

  delete from public.attempts where user_key = me::text;
  delete from public.reports  where user_key = me::text;

  -- 계정 줄은 남깁니다. 이 줄이 같은 아이디·이메일·전화번호로 다시 가입하는 것을 막습니다.
  update public.profiles
     set is_active = false,
         deleted_at = now()
   where user_id = me;

  return removed;
end;
$$;

comment on function public.withdraw_account() is
  '탈퇴. 진도·푼 기록·신고를 지우고 계정 줄만 남깁니다. 돌려주는 값은 지운 진도 줄 수';

grant execute on function public.withdraw_account() to authenticated;
