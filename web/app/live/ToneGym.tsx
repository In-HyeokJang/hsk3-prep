'use client';

import { useCallback, useEffect, useState } from 'react';
import { pickToneDeck, type Tone } from '@/lib/quiz';
import { speak } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { BIG, Ctl, LiveFrame, Speaker, useLiveKeys } from './shell';

/*
  ① 성조 체조 — 첫 게임.

  단어와 뜻을 크게 띄우고, 짚은 글자가 몇 성인지 **몸으로** 답합니다.
  "하나 둘 셋" 에 전원 동시.

  왜 이걸 첫 게임으로 두나: 화면이 할 일이 제일 적고, 종이나 카드 같은
  준비물이 없어서 첫 모임의 어색함을 깨는 데 제일 좋습니다.

  ★ TTS 는 정답 공개 뒤에만 냅니다.
    먼저 틀면 소리가 곧 정답입니다. 성조를 묻는 문제에서 그 단어를
    읽어주는 것은 답을 불러주는 것과 같습니다.

  ★ 아무것도 저장하지 않습니다. 맞고 틀린 것은 진행하는 사람이 셉니다.
*/

/** 한 라운드 문제 수. 6분에 이 정도가 들어갑니다 */
const ROUND = 10;

/** 몇 초를 세나 */
const COUNT_FROM = 3;

const MOVES: Record<Tone, { name: string; how: string }> = {
	1: { name: '1성', how: '팔을 옆으로 뻗어 그대로' },
	2: { name: '2성', how: '아래에서 위로 올려요' },
	3: { name: '3성', how: '내렸다가 다시 올려요 (V)' },
	4: { name: '4성', how: '위에서 아래로 내려쳐요' },
	0: { name: '경성', how: '어깨를 으쓱' },
};

type Phase = 'ready' | 'counting' | 'answer';

type Props = {
	words: Word[];
	dark: boolean;
	onDark: () => void;
	onExit: () => void;
	/** 게임 고르는 화면으로 */
	onBack: () => void;
};

export default function ToneGym({ words, dark, onDark, onExit, onBack }: Props) {
	// 묶음은 들어올 때 한 번만 뽑습니다. 다시 그릴 때마다 뽑으면
	// 문제가 눈앞에서 바뀝니다.
	const [deck] = useState(() => pickToneDeck(words, ROUND, () => false));

	const [at, setAt] = useState(0);
	const [phase, setPhase] = useState<Phase>('ready');
	const [count, setCount] = useState(COUNT_FROM);

	const quiz = deck[at];

	/* ── 하나 둘 셋 ───────────────────────────────────────── */

	useEffect(() => {
		if (phase !== 'counting') return;
		if (count <= 0) {
			setPhase('answer');
			return;
		}
		const timer = setTimeout(() => setCount((c) => c - 1), 1000);
		return () => clearTimeout(timer);
	}, [phase, count]);

	/* ── 정답을 공개한 뒤에만 읽어줍니다 ──────────────────── */

	useEffect(() => {
		if (phase !== 'answer' || !quiz) return;
		speak(quiz.word.hanzi);
	}, [phase, quiz]);

	/* ── 넘기기 ───────────────────────────────────────────── */

	// ★ 갱신 함수(setX(prev => ...)) 안에서 다른 상태를 바꾸지 않습니다.
	//   React 는 갱신 함수를 두 번 부를 수 있어서, 그 안에 넣으면
	//   문제가 두 칸씩 뜁니다. 지금 단계는 phase 로 그냥 읽으면 됩니다.
	const advance = useCallback(() => {
		if (phase === 'ready') {
			setCount(COUNT_FROM);
			setPhase('counting');
			return;
		}
		if (phase === 'answer') {
			setAt((i) => i + 1);
			setPhase('ready');
			return;
		}
		// 세는 중에는 안 받습니다. 아직 아무도 답을 안 했습니다
	}, [phase]);

	const prev = useCallback(() => {
		setAt((i) => Math.max(0, i - 1));
		setPhase('answer'); // 앞 문제는 이미 답을 본 상태로
	}, []);

	const showNow = useCallback(() => setPhase('answer'), []);

	useLiveKeys(
		{
			' ': advance,
			ArrowRight: advance,
			ArrowLeft: prev,
			Enter: showNow,
			Backspace: onBack,
		},
		['Backspace'],
	);

	/* ── 그리기 ───────────────────────────────────────────── */

	if (deck.length === 0) {
		return (
			<LiveFrame dark={dark} onDark={onDark} onExit={onExit}>
				<p style={{ fontSize: BIG.meaning }}>성조를 물을 수 있는 단어가 없습니다.</p>
			</LiveFrame>
		);
	}

	if (at >= deck.length) {
		return (
			<LiveFrame
				dark={dark}
				onDark={onDark}
				onExit={onExit}
				controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}
			>
				<div className="flex flex-col items-center gap-6 text-center">
					<p className="font-bold" style={{ fontSize: BIG.meaning }}>
						한 라운드 끝
					</p>
					<p className="opacity-60" style={{ fontSize: BIG.line }}>
						{deck.length}문제
					</p>
				</div>
			</LiveFrame>
		);
	}

	const chars = [...quiz.word.hanzi];
	const move = MOVES[quiz.tone];

	return (
		<LiveFrame
			dark={dark}
			onDark={onDark}
			onExit={onExit}
			badge={`${at + 1} / ${deck.length}`}
			controls={
				<>
					<Ctl onClick={prev}>← 이전</Ctl>
					<Ctl onClick={advance} wide>
						{phase === 'ready' ? '하나 둘 셋' : phase === 'counting' ? '…' : '다음 →'}
					</Ctl>
					{phase === 'answer' && (
						<Ctl onClick={() => speak(quiz.word.hanzi)}>다시 듣기</Ctl>
					)}
					<Ctl onClick={onBack}>게임 고르기</Ctl>
				</>
			}
		>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[2vmin] text-center">
				{/* 단어 — 묻는 글자만 진하게. 나머지는 흐리게 둡니다 */}
				<div className="live-han flex items-baseline gap-[1vmin]" style={{ fontSize: BIG.hanziRow }}>
					{chars.map((ch, i) => (
						<span
							key={i}
							className={
								i === quiz.at
									? 'border-b-[0.06em] border-current'
									: 'opacity-25'
							}
						>
							{ch}
						</span>
					))}
				</div>

				{/* 뜻 — 어떤 단어인지 알아야 몸이 움직입니다 */}
				<div className="font-semibold" style={{ fontSize: BIG.meaning }}>
					{quiz.word.meaning_ko}
				</div>

				{phase === 'counting' && (
					<div
						className="font-bold tabular-nums leading-none"
						style={{ fontSize: BIG.hanzi }}
					>
						{count}
					</div>
				)}

				{phase === 'answer' && (
					<div className="flex flex-col items-center gap-[1.5vmin]">
						<div className="flex items-center gap-[2vmin]">
							<span className="live-pinyin" style={{ fontSize: BIG.pinyin }}>
								{quiz.word.pinyin}
							</span>
							{/* 감싸는 것이 버튼이 아니라 형제로 둡니다 */}
							<button
								onClick={() => speak(quiz.word.hanzi)}
								aria-label="소리 듣기"
								className="shrink-0 rounded-full border border-current/25 p-[1.4vmin] opacity-50 transition-opacity hover:opacity-100"
							>
								<Speaker />
							</button>
						</div>

						<div className="font-bold" style={{ fontSize: BIG.meaning }}>
							{move.name}
						</div>
						<div className="opacity-60" style={{ fontSize: BIG.line }}>
							{move.how}
						</div>
					</div>
				)}
			</div>
		</LiveFrame>
	);
}
