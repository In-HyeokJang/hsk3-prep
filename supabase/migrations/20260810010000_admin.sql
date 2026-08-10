-- ============================================================
--  마이그레이션 23 · 관리자 칸
--
--  왜:
--    오프라인 모임 화면(/live)은 사장님 계정에서만 보여야 합니다.
--    회원 화면 메뉴에는 나오지 않습니다.
--
--  왜 코드에 아이디를 안 박나:
--    누가 관리자인지는 **자료**이지 구조가 아닙니다.
--    코드에 적어두면 관리자를 바꿀 때마다 다시 배포해야 합니다.
--    그래서 여기에는 칸과 함수만 만들고, 누구를 켤지는 SQL Editor 에서
--    한 줄로 정합니다:
--
--      update public.profiles set is_admin = true where lower(username) = 'tass';
--
--  자기를 관리자로 못 만드나:
--    못 만듭니다. 마이그레이션 12가 수정 권한을 email·phone 두 칸에만
--    줬습니다. 새로 생기는 칸은 아무에게도 권한이 없습니다.
--    (칸 단위는 RLS 가 아니라 grant 로 막힙니다 — 09-handoff.md 지뢰 표)
--
--  두 번 연속 실행해도 됩니다:
--    add column if not exists · drop function if exists → create
-- ============================================================


-- ------------------------------------------------------------
-- 1. 칸 하나
-- ------------------------------------------------------------
--
-- 기본값은 false 입니다. 아무도 관리자가 아닌 채로 시작합니다.

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  '관리자인가. /live 같은 진행용 화면을 볼 수 있습니다. SQL Editor 로만 켭니다';


-- ------------------------------------------------------------
-- 2. 판정 함수
-- ------------------------------------------------------------
--
-- 지금은 나중에 서버에서 막을 때(RLS·함수) 쓰려고 미리 만들어 둡니다.
-- 화면은 my_profile() 이 돌려주는 줄에서 is_admin 을 그냥 읽습니다.
--
-- security invoker 라 자기 줄만 봅니다. 남이 관리자인지는 알 수 없습니다.
-- 로그인 전이면 false 를 돌려줍니다 (null 이 아닙니다 — 판단에 바로 씁니다).

drop function if exists public.is_admin();

create function public.is_admin()
returns boolean
language sql
stable
security invoker
as $$
  select coalesce(
    (select p.is_admin
       from public.profiles p
      where p.user_id = auth.uid()
        and p.is_active),
    false);
$$;

grant execute on function public.is_admin() to authenticated;

comment on function public.is_admin() is
  '지금 로그인한 사람이 관리자인가. 아니거나 로그인 전이면 false';


-- ------------------------------------------------------------
-- 3. my_profile() 을 다시 만듭니다
-- ------------------------------------------------------------
--
-- 반환 형식이 public.profiles 인데 그 표에 칸이 하나 늘었습니다.
-- 여기서 다시 만들어야 **최종 정의가 가장 나중 파일에** 옵니다.
-- (마이그레이션은 매번 전부 다시 실행되고, 나중 파일이 이깁니다)
--
-- 내용은 마이그레이션 8과 같습니다. 줄 하나를 통째로 돌려주므로
-- 칸이 늘어난 것을 화면이 저절로 받습니다.

drop function if exists public.my_profile();

create function public.my_profile()
returns public.profiles
language sql
stable
security invoker
as $$
  select * from public.profiles where user_id = auth.uid();
$$;

grant execute on function public.my_profile() to authenticated;

comment on function public.my_profile() is
  '내 프로필 한 줄. is_admin 포함 (마이그레이션 23에서 다시 만듦)';
