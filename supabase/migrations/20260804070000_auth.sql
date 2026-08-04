-- ============================================================
--  마이그레이션 7 · 로그인 (회원가입)
--
--  지금까지:
--    로그인이 없어서 user_key 가 브라우저에 저장한 아무 번호였습니다.
--    서버는 "이 줄이 진짜 이 사람 것인가" 를 확인할 방법이 없었습니다.
--    (마이그레이션 1 맨 끝에 이 한계가 적혀 있습니다)
--
--  이제부터:
--    user_key 에 로그인한 사람의 번호(auth.uid())를 넣습니다.
--    표 구조는 그대로 두고 권한 규칙만 바꿉니다.
--
--      · 로그인해야 진도를 읽고 쓸 수 있습니다
--      · 자기 줄만 읽고 쓸 수 있습니다 (auth.uid() 와 user_key 가 같아야 함)
--      · 단어와 예문은 그대로 누구나 읽습니다
--
--    그리고 claim_progress() 로, 로그인 전에 브라우저에 쌓아둔 진도를
--    처음 로그인할 때 계정으로 옮겨옵니다.
-- ============================================================


-- ------------------------------------------------------------
-- 1. progress · 내 줄만
-- ------------------------------------------------------------
--
-- 예전 정책(누구나 전부)을 지우고 다시 만듭니다.
-- drop policy if exists 라서 몇 번을 실행해도 됩니다.

drop policy if exists "progress 읽기" on public.progress;
drop policy if exists "progress 추가" on public.progress;
drop policy if exists "progress 수정" on public.progress;

drop policy if exists "내 진도 읽기" on public.progress;
create policy "내 진도 읽기" on public.progress
  for select to authenticated
  using (auth.uid()::text = user_key);

drop policy if exists "내 진도 추가" on public.progress;
create policy "내 진도 추가" on public.progress
  for insert to authenticated
  with check (auth.uid()::text = user_key);

drop policy if exists "내 진도 수정" on public.progress;
create policy "내 진도 수정" on public.progress
  for update to authenticated
  using (auth.uid()::text = user_key)
  with check (auth.uid()::text = user_key);


-- ------------------------------------------------------------
-- 2. attempts · 내 줄만
-- ------------------------------------------------------------

drop policy if exists "attempts 읽기" on public.attempts;
drop policy if exists "attempts 추가" on public.attempts;

drop policy if exists "내 기록 읽기" on public.attempts;
create policy "내 기록 읽기" on public.attempts
  for select to authenticated
  using (auth.uid()::text = user_key);

drop policy if exists "내 기록 추가" on public.attempts;
create policy "내 기록 추가" on public.attempts
  for insert to authenticated
  with check (auth.uid()::text = user_key);

-- delete 정책은 여전히 없습니다 = 사이트에서는 못 지웁니다. 일부러 그렇습니다.


-- ------------------------------------------------------------
-- 3. claim_progress() · 브라우저에 쌓인 진도를 계정으로 옮기기
-- ------------------------------------------------------------
--
-- 로그인 전에는 브라우저 번호로 진도가 쌓여 있습니다.
-- 그 줄들은 user_key 가 내 계정 번호가 아니라서, 위의 규칙에 걸려
-- 내가 손댈 수 없습니다. 그래서 이 함수만 security definer 로 만듭니다.
-- (security definer = 규칙을 건너뛰고 실행한다는 뜻)
--
-- 대신 두 가지를 잠급니다.
--   · 로그인한 사람만 부를 수 있습니다
--   · 내 계정에 진도가 하나도 없을 때만 옮깁니다 (= 처음 로그인할 때 한 번)
--
-- 두 번째 조건이 중요합니다. 이게 없으면 남의 번호를 넣어보면서
-- 남의 진도를 계속 가져갈 수 있습니다.

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

comment on function public.claim_progress(text) is
  '로그인 전 브라우저에 쌓인 진도를 내 계정으로 옮깁니다. 계정이 비어 있을 때만 동작합니다';
