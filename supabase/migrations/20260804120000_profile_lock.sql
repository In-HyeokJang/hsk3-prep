-- ============================================================
--  마이그레이션 12 · 프로필에서 고칠 수 있는 칸을 좁힙니다
--
--  무엇이 문제였나:
--    마이그레이션 8의 "내 프로필 수정" 규칙은 **어느 줄을** 고칠 수 있는지만
--    정하고, **어느 칸을** 고칠 수 있는지는 정하지 않았습니다.
--
--    RLS 는 줄 단위로만 막습니다. 칸 단위 제한은 RLS 가 아니라
--    "권한(grant)" 으로 해야 합니다. 그걸 안 해둬서 이런 일이 됩니다.
--
--      · 탈퇴한 사람이 is_active 를 스스로 true 로 되돌립니다  ← 탈퇴가 무의미해짐
--      · 남의 이메일·전화번호를 자기 것으로 적어 넣습니다
--      · 아이디(username)를 남의 것으로 바꿉니다
--
--    화면에는 그런 버튼이 없지만, 브라우저에서 서버를 직접 부르면 됩니다.
--    화면에 없다는 것은 막았다는 뜻이 아닙니다.
--
--  어떻게 고치나:
--    수정 권한을 통째로 거둬들이고, 이메일과 전화번호에만 다시 줍니다.
--    is_active · deleted_at · username · user_id 는 이제 아무도 직접 못 고칩니다.
--    탈퇴는 withdraw_account() 함수로만 됩니다 (그 함수는 규칙을 건너뛰게 만들어둠).
-- ============================================================


-- ------------------------------------------------------------
-- 1. 칸 단위 권한
-- ------------------------------------------------------------
--
-- revoke 로 전부 거둔 뒤, 필요한 칸에만 다시 줍니다.
-- 몇 번을 실행해도 결과가 같습니다.

revoke update on public.profiles from anon, authenticated;
grant  update (email, phone) on public.profiles to authenticated;

-- 넣기·지우기는 애초에 아무에게도 주지 않습니다.
-- 프로필은 가입할 때 방아쇠(trigger)가 만들고, 지우는 일은 없습니다.
revoke insert, delete on public.profiles from anon, authenticated;


-- ------------------------------------------------------------
-- 2. 탈퇴한 계정은 자기 프로필도 못 고치게
-- ------------------------------------------------------------

drop policy if exists "내 프로필 수정" on public.profiles;
create policy "내 프로필 수정" on public.profiles
  for update to authenticated
  using (auth.uid() = user_id and is_active)
  with check (auth.uid() = user_id and is_active);


-- ------------------------------------------------------------
-- 3. 연락처를 고치는 정식 통로
-- ------------------------------------------------------------
--
-- 칸 권한만 열어두면 화면에서 모양을 안 다듬고 보낼 수 있습니다.
-- 마이그레이션 10에서 정한 모양(010-1234-5678 / 소문자 이메일)을
-- 여기서 한 번 더 맞춰서 넣습니다. 가입할 때와 같은 규칙입니다.
--
-- 둘 중 하나는 반드시 남아야 합니다. 둘 다 지우면 찾을 방법이 없어집니다.

create or replace function public.update_contact(
  p_email text default null,
  p_phone text default null
)
returns public.profiles
language plpgsql
security invoker
as $$
declare
  v_email  text := nullif(btrim(p_email), '');
  v_phone  text := nullif(btrim(p_phone), '');
  v_digits text;
  result   public.profiles;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다';
  end if;

  if v_email is null and v_phone is null then
    raise exception '이메일이나 전화번호 중 하나는 남겨야 합니다';
  end if;

  if v_email is not null then
    v_email := lower(v_email);
  end if;

  if v_phone is not null then
    v_digits := regexp_replace(v_phone, '\D', '', 'g');
    v_phone := case
      when length(v_digits) = 11 then regexp_replace(v_digits, '^(\d{3})(\d{4})(\d{4})$', '\1-\2-\3')
      when length(v_digits) = 10 and v_digits like '02%'
                                 then regexp_replace(v_digits, '^(\d{2})(\d{4})(\d{4})$', '\1-\2-\3')
      when length(v_digits) = 10 then regexp_replace(v_digits, '^(\d{3})(\d{3})(\d{4})$', '\1-\2-\3')
      else v_phone
    end;
  end if;

  -- security invoker 라 위의 규칙과 칸 권한이 그대로 적용됩니다.
  -- 탈퇴한 계정이면 여기서 한 줄도 안 바뀝니다.
  update public.profiles
     set email = v_email,
         phone = v_phone
   where user_id = auth.uid()
  returning * into result;

  if result is null then
    raise exception '고칠 수 없는 계정입니다';
  end if;

  return result;
end;
$$;

grant execute on function public.update_contact(text, text) to authenticated;

comment on function public.update_contact(text, text) is
  '내 연락처를 고칩니다. 모양을 가입할 때와 같게 다듬어서 넣습니다';
