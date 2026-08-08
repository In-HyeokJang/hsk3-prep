-- ============================================================
--  마이그레이션 22 · 손으로 쓴 기록을 남길 수 있게 합니다
--
--  무엇을 바꾸나:
--    attempts 표의 quiz_type 이 받는 값에 'write' 를 더합니다.
--
--  왜 따로 만드나:
--    손으로 쓰는 것은 다른 어떤 유형과도 다른 것을 봅니다.
--      meaning  뜻을 아는가
--      pinyin   읽을 줄 아는가
--      hanzi    보고 고를 수 있는가   ← 알아보는 것
--      write    보지 않고 쓸 수 있는가 ← 꺼내는 것
--
--    알아보는 것과 꺼내는 것은 실력이 다릅니다. 고르기는 다 맞는데
--    쓰라고 하면 손이 안 나가는 일이 흔합니다. 같은 이름으로 묶으면
--    나중에 "쓰기만 유독 약하다" 를 못 뽑습니다.
--    기록은 한 번 뭉개면 되살릴 수 없어서, 처음부터 나눠 둡니다.
--
--  ★ 몇 번을 돌려도 같습니다.
--    제약을 지우고 다시 만듭니다. 표에 이미 쌓인 줄은 건드리지 않습니다.
--    (기존 값 일곱 가지가 새 목록에도 그대로 들어 있어서 검사를 통과합니다)
-- ============================================================

alter table public.attempts
  drop constraint if exists attempts_quiz_type_check;

alter table public.attempts
  add constraint attempts_quiz_type_check
  check (quiz_type in ('meaning', 'pinyin', 'hanzi', 'blank', 'tone', 'write', 'listen', 'speak'));

comment on column public.attempts.quiz_type is
  'meaning 뜻 · pinyin 병음 · hanzi 한자 · blank 빈칸 · tone 성조 · write 손으로 쓰기 · listen 듣기 · speak 말하기';
