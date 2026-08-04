-- ============================================================
--  마이그레이션 9 · 확인 메일 없이 바로 가입되게
--
--  무엇이 문제였나:
--    이 사이트는 아이디로 가입합니다. 이메일은 "나중에 찾을 때" 쓰려고
--    받아두는 것이지, 로그인에 쓰는 것이 아닙니다.
--
--    그런데 Supabase 는 가입할 때마다 확인 메일을 보내려 하고,
--    보낼 곳이 없으니 가입 자체가 실패했습니다.
--      429 over_email_send_rate_limit
--
--  어떻게 고치나:
--    계정이 만들어지는 순간에 "이미 확인된 계정" 으로 표시해 둡니다.
--    확인할 것이 없으면 메일을 보낼 이유도 없습니다.
--
--  ★ 이래도 되나:
--    됩니다. 이 사이트는 이메일로 로그인하지 않습니다.
--    이메일은 본인이 적어두는 메모에 가깝고, 로그인 열쇠는 아이디와 비밀번호입니다.
-- ============================================================

create or replace function public.auto_confirm_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  if new.confirmed_at is null then
    -- confirmed_at 은 계산된 칸일 수 있어서, 안 되면 조용히 넘어갑니다
    begin
      new.confirmed_at := now();
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_auto_confirm on auth.users;
create trigger on_auth_user_auto_confirm
  before insert on auth.users
  for each row execute function public.auto_confirm_user();

comment on function public.auto_confirm_user() is
  '아이디로 가입하는 사이트라 확인 메일이 필요 없습니다. 만들어질 때 바로 확인된 것으로 둡니다';

-- 혹시 확인이 안 된 채로 남은 계정이 있으면 지금 확인 처리합니다.
-- 두 번째 실행부터는 대상이 없어서 아무 일도 일어나지 않습니다.
update auth.users set email_confirmed_at = now() where email_confirmed_at is null;
