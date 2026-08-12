'use client';

import { useCallback, useState } from 'react';
import { speak } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { BIG, Ctl, LiveFrame, Speaker, useLiveKeys } from './shell';

/*
  단어 훑기 (옛 이름: 단어 넘기기) — 게임이 아니라 화면 뼈대입니다.

  단어 하나를 세 단계로 공개합니다.
    ① 한자만 → ② +병음(+소리) → ③ +뜻·예문

  ★ 아무것도 저장하지 않습니다.
    mark_word 도 log_attempt 도 부르지 않습니다. 10명의 답이 사장님 개인
    복습 일정에 섞이면 되돌릴 방법이 없습니다.
*/

const LAST_STEP = 2;

type Props = {
	words: Word[];
	dark: boolean;
	onDark: () => void;
	onExit: () => void;
};

export default function Cards({ words, dark, onDark, onExit }: Props) {
	// ★ 자리(at)와 공개 단계(step)를 한 덩어리로 둡니다.
	//   따로 두면 "step 을 고치면서 그 안에서 at 도 고치는" 모양이 되는데,
	//   React 는 갱신 함수를 두 번 부를 수 있어서 단어가 두 칸씩 뜁니다.
	const [pos, setPos] = useState({ at: 0, step: 0 });
	const { at, step } = pos;

	const next = useCallback(() => {
		setPos((p) =>
			p.step < LAST_STEP ? { at: p.at, step: p.step + 1 } : { at: p.at + 1, step: 0 },
		);
	}, []);

	const prev = useCallback(() => {
		setPos((p) =>
			p.step > 0
				? { at: p.at, step: p.step - 1 }
				: // 앞 단어로 돌아갈 때는 이미 다 본 상태로 보여줍니다.
					// 다시 한 단계씩 열게 하면 진행이 끊깁니다.
					{ at: Math.max(0, p.at - 1), step: LAST_STEP },
		);
	}, []);

	const revealAll = useCallback(() => setPos((p) => ({ at: p.at, step: LAST_STEP })), []);

	useLiveKeys({
		' ': next,
		ArrowRight: next,
		ArrowLeft: prev,
		Enter: revealAll,
	});

	const done = at >= words.length;
	const word = words[Math.min(at, words.length - 1)];

	return (
		<LiveFrame
			dark={dark}
			onDark={onDark}
			onExit={onExit}
			badge={`${Math.min(at + 1, words.length)} / ${words.length}`}
			controls={
				<>
					<Ctl onClick={prev}>← 이전</Ctl>
					<Ctl onClick={next} wide>
						{step < LAST_STEP ? '공개' : '다음 →'}
					</Ctl>
				</>
			}
		>
			{done ? (
				<div className="flex flex-col items-center gap-6 text-center">
					<p style={{ fontSize: BIG.meaning }} className="font-bold">
						오늘은 여기까지
					</p>
					<Ctl onClick={() => setPos({ at: 0, step: 0 })}>처음부터 다시</Ctl>
				</div>
			) : (
				<div className="flex w-full max-w-[92vw] flex-col items-center gap-[2vmin] text-center">
					{/* ① 한자 — 늘 보입니다 */}
					<div className="live-han" style={{ fontSize: BIG.hanzi }}>
						{word.hanzi}
					</div>

					{/* ② 병음 + 소리 */}
					{step >= 1 && (
						<div className="flex items-center gap-[2vmin]">
							<span className="live-pinyin opacity-80" style={{ fontSize: BIG.pinyin }}>
								{word.pinyin}
							</span>
							{/* 감싸는 것이 버튼이 아니라 형제로 둡니다 (버튼 안의 버튼 금지) */}
							<button
								onClick={() => speak(word.hanzi)}
								aria-label="소리 듣기"
								className="shrink-0 rounded-full border border-current/25 p-[1.4vmin] opacity-50 transition-opacity hover:opacity-100"
							>
								<Speaker />
							</button>
						</div>
					)}

					{/* ③ 뜻 + 예문 — 세 줄을 넘기지 않습니다 */}
					{step >= LAST_STEP && (
						<>
							<div className="font-semibold" style={{ fontSize: BIG.meaning }}>
								{word.meaning_ko}
							</div>
							{word.example_zh && (
								<div className="han opacity-70" style={{ fontSize: BIG.line }}>
									{word.example_zh}
								</div>
							)}
						</>
					)}
				</div>
			)}
		</LiveFrame>
	);
}
