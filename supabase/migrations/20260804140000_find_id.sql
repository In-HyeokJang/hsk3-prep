-- ============================================================
--  마이그레이션 14 · 아이디 찾기, 그리고 캐묻기 막기
--
--  (1) 아이디 찾기
--    가입할 때 "나중에 아이디나 비밀번호를 잊었을 때 쓰는 것" 이라며
--    연락처를 받아놓고, 정작 찾는 기능이 없었습니다.
--
--    연락처를 넣으면 그 사람의 아이디를 **가려서** 보여줍니다.
--      hong1234  →  ho*****4
--
--    왜 통째로 안 보여주나:
--      전화번호를 아무거나 넣어보면서 남의 아이디를 모을 수 있습니다.
--      본인은 앞뒤 글자만 봐도 "아 맞다" 하고 기억해냅니다.
--
--  (2) signup_taken 이 캐묻기 도구였습니다
--    로그인 없이 누구나 부를 수 있어서, 이메일·전화번호를 넣어보며
--    **"이 사람이 이 사이트를 쓰는가"** 를 무제한으로 확인할 수 있었습니다.
--
--    이제 아이디 중복만 알려줍니다. 아이디는 어차피 남에게 보이는 이름이고,
--    이메일·전화번호 중복은 가입할 때 방아쇠가 막습니다 (마이그레이션 8).
--
--  ★ 비밀번호는 여기서 못 찾습니다.
--    로그인 주소가 hong1234@hsk3.local 이라는 가짜 주소여서
--    재설정 메일을 보낼 곳이 없습니다. 관리자가 직접 바꿔줘야 합니다.
--
--      update auth.users
--         set encrypted_password = extensions.crypt('새비밀번호', extensions.gen_salt('bf'))
--       where email = 'hong1234@hsk3.local';
-- ============================================================


-- ------------------------------------------------------------
-- 1. 아이디 찾기
-- ------------------------------------------------------------
--
-- 이메일이나 전화번호 중 하나를 받습니다. 둘 다 주면 이메일을 먼저 봅니다.
-- 못 찾으면 빈 문자열을 돌려줍니다 (없다는 것도 알려주는 셈이지만,
-- 그건 가입 화면에서 어차피 드러나는 정보입니다).
--
-- 탈퇴한 계정은 안 찾아줍니다. 어차피 못 들어오니까요.

create or replace function public.find_username(
  p_email text default null,
  p_phone text default null
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_email  text := nullif(lower(btrim(p_email)), '');
  v_phone  text := nullif(btrim(p_phone), '');
  v_digits text;
  found    text;
begin
  if v_email is null and v_phone is null then
    return '';
  end if;

  -- 전화번호는 저장된 모양(010-1234-5678)으로 맞춰서 찾습니다.
  -- 사용자가 01012345678 로 쳐도 찾히게요.
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

  select username into found
    from public.profiles
   where is_active
     and (
       (v_email is not null and lower(email) = v_email)
       or (v_phone is not null and phone = v_phone)
     )
   limit 1;

  if found is null then
    return '';
  end if;

  -- 가려서 돌려줍니다. 앞 2글자 + 별표 + 끝 1글자.
  --   hong1234 → ho*****4      abcd → ab*d
  return left(found, 2)
       || repeat('*', greatest(length(found) - 3, 1))
       || right(found, 1);
end;
$$;

grant execute on function public.find_username(text, text) to anon, authenticated;

comment on function public.find_username(text, text) is
  '연락처로 아이디를 가려서 알려줍니다. 통째로 주면 남의 아이디를 모을 수 있어서 가립니다';


-- ------------------------------------------------------------
-- 2. signup_taken 은 아이디만 알려줍니다
-- ------------------------------------------------------------
--
-- ★ 마이그레이션 8의 signup_taken 을 대신하는 최종 정의입니다.
--   이메일·전화번호는 이제 여기서 안 알려줍니다.
--   중복이면 가입할 때 방아쇠가 막고, 화면은 뭉뚱그린 말로 안내합니다.

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
    else ''
  end;
$$;

comment on function public.signup_taken(text, text, text) is
  '아이디 중복만 미리 알려줍니다. 이메일·전화번호는 캐물을 수 없게 일부러 안 알려줍니다';
