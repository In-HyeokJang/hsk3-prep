-- ============================================================
--  마이그레이션 11 · 사용 여부와 탈퇴 (소프트 삭제)
--
--  왜 계정을 지우지 않나:
--    탈퇴한 사람의 줄을 통째로 지우면, 같은 아이디·이메일·전화번호로
--    바로 다시 가입할 수 있게 됩니다. 그러면 탈퇴가 "기록 지우개" 가 됩니다.
--
--    그래서 계정 줄은 남기고 "이제 안 쓰는 계정" 이라고 표시만 합니다.
--    남은 줄이 중복 가입을 막아줍니다.
--
--  탈퇴하면 어떻게 되나:
--      is_active   true → false   (사용 안 함)
--      deleted_at  탈퇴한 시각
--      진도(progress) · 푼 기록(attempts)   전부 삭제
--      아이디 · 이메일 · 전화번호           남김 (중복 가입 막기용)
--
--  탈퇴한 계정으로는 로그인해도 아무것도 못 합니다.
--  화면에서도 막고, 아래 권한 규칙에서도 막습니다.
-- ============================================================


-- ------------------------------------------------------------
-- 1. 사용 여부 칸
-- ------------------------------------------------------------

alter table public.profiles add column if not exists is_active  boolean not null default true;
alter table public.profiles add column if not exists deleted_at timestamptz;

comment on column public.profiles.is_active  is 'false 면 탈퇴한 계정. 줄은 남기고 표시만 바꿉니다';
comment on column public.profiles.deleted_at is '탈퇴한 시각. is_active 가 false 일 때만 값이 있습니다';

-- 표시가 서로 어긋나지 않게 묶어둡니다.
-- 쓰는 계정인데 탈퇴 시각이 있거나, 탈퇴했는데 시각이 없으면 안 됩니다.
alter table public.profiles drop constraint if exists profiles_active_shape;
alter table public.profiles add  constraint profiles_active_shape
  check ((is_active and deleted_at is null) or (not is_active and deleted_at is not null));

create index if not exists profiles_active_idx on public.profiles (is_active);


-- ------------------------------------------------------------
-- 2. 지금 로그인한 사람이 쓸 수 있는 계정인가
-- ------------------------------------------------------------
--
-- 권한 규칙 여러 곳에서 같은 판단을 해야 해서 함수로 빼둡니다.
-- 한 군데만 고치면 전부 같이 바뀝니다.

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_active from public.profiles where user_id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_active_user() to authenticated;

comment on function public.is_active_user() is
  '지금 로그인한 사람이 탈퇴하지 않은 계정인지. 권한 규칙에서 씁니다';


-- ------------------------------------------------------------
-- 3. 탈퇴한 계정은 진도에 손댈 수 없게
-- ------------------------------------------------------------
--
-- 마이그레이션 7의 규칙에 "쓰는 계정인가" 를 하나 더 얹습니다.

drop policy if exists "내 진도 읽기" on public.progress;
create policy "내 진도 읽기" on public.progress
  for select to authenticated
  using (auth.uid()::text = user_key and public.is_active_user());

drop policy if exists "내 진도 추가" on public.progress;
create policy "내 진도 추가" on public.progress
  for insert to authenticated
  with check (auth.uid()::text = user_key and public.is_active_user());

drop policy if exists "내 진도 수정" on public.progress;
create policy "내 진도 수정" on public.progress
  for update to authenticated
  using (auth.uid()::text = user_key and public.is_active_user())
  with check (auth.uid()::text = user_key and public.is_active_user());

drop policy if exists "내 기록 읽기" on public.attempts;
create policy "내 기록 읽기" on public.attempts
  for select to authenticated
  using (auth.uid()::text = user_key and public.is_active_user());

drop policy if exists "내 기록 추가" on public.attempts;
create policy "내 기록 추가" on public.attempts
  for insert to authenticated
  with check (auth.uid()::text = user_key and public.is_active_user());


-- ------------------------------------------------------------
-- 4. 탈퇴하기
-- ------------------------------------------------------------
--
-- 왜 함수로 만드나:
--   지우는 일과 표시를 바꾸는 일이 한 번에 끝나야 합니다.
--   화면에서 나눠서 하면, 진도는 지워졌는데 표시는 그대로인 상태가 생깁니다.
--
--   그리고 진도를 지우려면 delete 권한이 필요한데,
--   그 권한은 일부러 아무에게도 주지 않았습니다 (마이그레이션 1).
--   이 함수만 security definer 로 두어 여기서만 지울 수 있게 합니다.
--
-- 돌려주는 값: 지운 진도 줄 수

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

  -- 계정 줄은 남깁니다. 이 줄이 같은 아이디·이메일·전화번호로 다시 가입하는 것을 막습니다.
  update public.profiles
     set is_active = false,
         deleted_at = now()
   where user_id = me;

  return removed;
end;
$$;

revoke all on function public.withdraw_account() from public, anon;
grant execute on function public.withdraw_account() to authenticated;

comment on function public.withdraw_account() is
  '탈퇴합니다. 진도와 기록은 지우고 계정 줄은 남깁니다 (중복 가입 막기용)';


-- ------------------------------------------------------------
-- 5. 탈퇴한 계정은 진도를 옮겨받지도 못하게
-- ------------------------------------------------------------
--
-- 마이그레이션 7의 claim_progress 에 같은 조건을 더합니다.

create or replace function public.claim_progress(p_old_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  me      text := auth.uid()::text;
  already integer;
  moved   integer;
begin
  if me is null then
    raise exception '로그인이 필요합니다';
  end if;

  if not public.is_active_user() then
    return 0;  -- 탈퇴한 계정
  end if;

  if p_old_key is null or btrim(p_old_key) = '' or p_old_key = me then
    return 0;
  end if;

  select count(*) into already from public.progress where user_key = me;
  if already > 0 then
    return 0;  -- 이미 이 계정에 진도가 있습니다. 건드리지 않습니다.
  end if;

  update public.progress set user_key = me where user_key = p_old_key;
  get diagnostics moved = row_count;

  update public.attempts set user_key = me where user_key = p_old_key;

  return moved;
end;
$$;

revoke all on function public.claim_progress(text) from public, anon;
grant execute on function public.claim_progress(text) to authenticated;
