-- ============================================================
--  마이그레이션 18 · 성조 문제를 기록할 수 있게 합니다
--
--  무엇을 바꾸나:
--    attempts 표의 quiz_type 이 받는 값에 'tone' 을 더합니다.
--
--  왜 따로 만드나:
--    성조 문제는 '병음 고르기'(pinyin)와 다른 것을 봅니다.
--      pinyin  이 글자를 어떻게 읽는가 (소리 전체)
--      tone    이 글자의 높낮이가 몇 성인가
--    같은 이름으로 묶으면 나중에 "성조만 유독 약하다" 를 못 뽑습니다.
--    기록은 한 번 뭉개면 되살릴 수 없어서, 처음부터 나눠 둡니다.
--
--  ★ 몇 번을 돌려도 같습니다.
--    제약을 지우고 다시 만듭니다. 표에 이미 쌓인 줄은 건드리지 않습니다.
--    (기존 값 여섯 가지가 새 목록에도 그대로 들어 있어서 검사를 통과합니다)
-- ============================================================

alter table public.attempts
  drop constraint if exists attempts_quiz_type_check;

alter table public.attempts
  add constraint attempts_quiz_type_check
  check (quiz_type in ('meaning', 'pinyin', 'hanzi', 'blank', 'tone', 'listen', 'speak'));

comment on column public.attempts.quiz_type is
  'meaning 뜻 · pinyin 병음 · hanzi 한자 · blank 빈칸 · tone 성조 · listen 듣기 · speak 말하기';
