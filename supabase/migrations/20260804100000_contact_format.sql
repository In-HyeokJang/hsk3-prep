-- ============================================================
--  마이그레이션 10 · 연락처 형식 통일
--
--  무엇이 문제였나:
--    이메일과 전화번호를 자유롭게 적게 뒀더니 모양이 제각각이었습니다.
--      01012345678 / 010-1234-5678 / 010 1234 5678 ...
--
--    모양이 다르면 "같은 번호인데 중복으로 안 걸리는" 일이 생깁니다.
--    01012345678 과 010-1234-5678 은 글자로는 다르니까요.
--
--  어떻게 고치나:
--    저장되는 모양을 하나로 정하고, DB에서 지킵니다.
--
--      전화번호   010-1234-5678   (숫자 사이에 하이픈)
--      이메일     아이디@주소     (@ 하나, 점 하나 이상)
--
--    화면에서도 칸을 나눠서 받지만, 진짜 자물쇠는 여기입니다.
--    화면은 언제든 바뀔 수 있고, 다른 경로로 들어올 수도 있으니까요.
-- ============================================================


-- ------------------------------------------------------------
-- 1. 이미 들어와 있는 번호를 새 모양으로 바꿉니다
-- ------------------------------------------------------------
--
-- 규칙을 먼저 걸면, 모양이 안 맞는 기존 줄 때문에 실패합니다.
-- 그래서 고치는 것이 먼저입니다.
--
-- 숫자만 남긴 뒤 길이에 따라 나눕니다.
--   01012345678 (11자리) → 010-1234-5678
--   0101234567  (10자리) → 010-123-4567
--   0212345678  (10자리, 서울) → 02-1234-5678
--
-- 두 번째 실행부터는 이미 하이픈이 있어서 대상이 없습니다.

update public.profiles
   set phone = case
     when length(regexp_replace(phone, '\D', '', 'g')) = 11
       then regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(\d{3})(\d{4})(\d{4})$', '\1-\2-\3')
     when length(regexp_replace(phone, '\D', '', 'g')) = 10
      and regexp_replace(phone, '\D', '', 'g') like '02%'
       then regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(\d{2})(\d{4})(\d{4})$', '\1-\2-\3')
     when length(regexp_replace(phone, '\D', '', 'g')) = 10
       then regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^(\d{3})(\d{3})(\d{4})$', '\1-\2-\3')
     else phone
   end
 where phone is not null
   and phone !~ '^0\d{1,2}-\d{3,4}-\d{4}$';


-- ------------------------------------------------------------
-- 2. 앞으로는 이 모양만 받습니다
-- ------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_phone_shape;
alter table public.profiles add  constraint profiles_phone_shape
  check (phone is null or phone ~ '^0\d{1,2}-\d{3,4}-\d{4}$');

alter table public.profiles drop constraint if exists profiles_email_shape;
alter table public.profiles add  constraint profiles_email_shape
  check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');


-- ------------------------------------------------------------
-- 3. 가입할 때 모양을 다듬어서 넣습니다
-- ------------------------------------------------------------
--
-- 화면이 이미 다듬어서 보내지만, 여기서 한 번 더 정리합니다.
-- 이메일은 소문자로, 전화번호는 하이픈 모양으로.
-- 이렇게 해두면 "Hong@Gmail.com" 과 "hong@gmail.com" 이 중복으로 걸립니다.
--
-- ★ 마이그레이션 8의 handle_new_user 를 대신하는 최종 정의입니다.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := nullif(btrim(new.raw_user_meta_data ->> 'email'), '');
  v_phone text := nullif(btrim(new.raw_user_meta_data ->> 'phone'), '');
  v_digits text;
begin
  -- 이메일은 소문자로 모읍니다
  if v_email is not null then
    v_email := lower(v_email);
  end if;

  -- 전화번호는 숫자만 남긴 뒤 하이픈을 다시 넣습니다
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

  insert into public.profiles (user_id, username, email, phone)
  values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
    v_email,
    v_phone
  );
  return new;
end;
$$;
