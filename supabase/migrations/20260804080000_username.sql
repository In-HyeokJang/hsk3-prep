-- ============================================================
--  마이그레이션 8 · 아이디로 가입하기
--
--  바뀐 기획:
--    이메일이 아니라 "아이디" 로 가입하고 로그인합니다.
--    이메일이나 전화번호는 나중에 아이디·비밀번호를 찾을 때 쓰려고 받아둡니다.
--    아이디 · 이메일 · 전화번호는 모두 중복으로 못 씁니다.
--
--  Supabase 는 원래 이메일로 로그인합니다. 아이디를 쓰려면?
--    아이디에서 내부용 주소를 만들어 씁니다.  hong123  →  hong123@hsk3.local
--    이 주소는 사람이 쓰는 메일함이 아니라 자물쇠의 이름표 같은 것입니다.
--    화면에는 절대 나오지 않고, 사용자는 아이디만 봅니다.
--
--    덤으로 아이디 중복이 저절로 막힙니다.
--    Supabase 가 이미 "같은 주소로 두 번 가입" 을 막고 있어서요.
--
--  ★ 그래서 Supabase 설정에서 "Confirm email" 을 꺼야 합니다.
--    hong123@hsk3.local 로는 확인 메일을 받을 수가 없습니다.
-- ============================================================


-- ------------------------------------------------------------
-- 1. profiles · 아이디와 연락처
-- ------------------------------------------------------------
--
-- 비밀번호는 여기 없습니다. Supabase 가 따로 안전하게 보관합니다.
-- 우리는 절대 비밀번호를 보관하지 않습니다.

create table if not exists public.profiles (
  user_id    uuid        primary key references auth.users(id) on delete cascade,
  username   text        not null,
  email      text,                              -- 찾기용. 없어도 됨
  phone      text,                              -- 찾기용. 없어도 됨
  created_at timestamptz not null default now(),

  -- 아이디: 영문·숫자·밑줄 4~20자. 한글이나 빈칸은 안 됩니다.
  constraint profiles_username_shape check (username ~ '^[A-Za-z0-9_]{4,20}$'),

  -- 둘 다 비워두면 나중에 찾을 방법이 없습니다. 하나는 꼭 받습니다.
  constraint profiles_contact_required check (
    coalesce(btrim(email), '') <> '' or coalesce(btrim(phone), '') <> ''
  )
);

comment on table public.profiles is '아이디와 찾기용 연락처. 비밀번호는 여기 없습니다';

-- 중복 막기. 대소문자만 다른 아이디(Hong / hong)도 같은 것으로 봅니다.
create unique index if not exists profiles_username_key on public.profiles (lower(username));
create unique index if not exists profiles_email_key    on public.profiles (lower(email)) where email is not null;
create unique index if not exists profiles_phone_key    on public.profiles (phone)        where phone is not null;

alter table public.profiles enable row level security;

drop policy if exists "내 프로필 읽기" on public.profiles;
create policy "내 프로필 읽기" on public.profiles
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "내 프로필 수정" on public.profiles;
create policy "내 프로필 수정" on public.profiles
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- insert 정책이 없습니다. 프로필은 아래 방아쇠(trigger)만 만듭니다.


-- ------------------------------------------------------------
-- 2. 가입하면 프로필이 저절로 만들어지게
-- ------------------------------------------------------------
--
-- 왜 방아쇠로 하나:
--   화면에서 "가입 → 프로필 저장" 을 두 번에 나눠 하면,
--   가입은 됐는데 프로필 저장이 실패하는 틈이 생깁니다.
--   그러면 아이디만 선점하고 연락처가 없는 유령 계정이 남습니다.
--
--   방아쇠로 묶으면 프로필이 실패할 때 가입 자체가 취소됩니다.
--   중복된 이메일·전화번호도 여기서 확실히 걸립니다.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, username, email, phone)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'email'),    ''),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'),    '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ------------------------------------------------------------
-- 3. 가입 전에 "이미 쓰는 것인지" 물어보기
-- ------------------------------------------------------------
--
-- 방아쇠가 진짜 자물쇠이고, 이건 화면에서 미리 알려주기 위한 것입니다.
-- 무엇이 겹쳤는지만 알려주고 남의 정보는 하나도 돌려주지 않습니다.
--
-- 돌려주는 값: 'username' | 'email' | 'phone' | '' (겹치는 게 없음)

create or replace function public.signup_taken(
  p_username text default null,
  p_email    text default null,
  p_phone    text default null
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when coalesce(btrim(p_username), '') <> ''
     and exists (select 1 from public.profiles where lower(username) = lower(btrim(p_username)))
      then 'username'
    when coalesce(btrim(p_email), '') <> ''
     and exists (select 1 from public.profiles where lower(email) = lower(btrim(p_email)))
      then 'email'
    when coalesce(btrim(p_phone), '') <> ''
     and exists (select 1 from public.profiles where phone = btrim(p_phone))
      then 'phone'
    else ''
  end;
$$;

grant execute on function public.signup_taken(text, text, text) to anon, authenticated;

comment on function public.signup_taken(text, text, text) is
  '가입 화면에서 중복을 미리 알려줍니다. 겹치는 칸 이름만 돌려주고 남의 정보는 안 줍니다';


-- ------------------------------------------------------------
-- 4. 내 아이디 보기
-- ------------------------------------------------------------
--
-- 화면 위에 "hong123 님" 을 띄우려면 필요합니다.
-- profiles 를 직접 읽어도 되지만, 이게 한 줄이라 화면 코드가 짧아집니다.

create or replace function public.my_profile()
returns public.profiles
language sql
stable
security invoker
as $$
  select * from public.profiles where user_id = auth.uid();
$$;

grant execute on function public.my_profile() to authenticated;
