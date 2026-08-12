'use client';

import { useCallback, useEffect, useState } from 'react';
import { pickToneDeck, type Tone } from '@/lib/quiz';
import { speak } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { BIG, Ctl, LiveFrame, Speaker, useLiveKeys, type Teams } from './shell';

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

/**
 * 정답에는 성조 이름만 띄웁니다.
 *
 * 몸 동작 설명(팔을 위로, 내렸다 올리고…)을 같이 띄워봤더니
 * 오히려 헷갈렸습니다. 동작은 진행자가 첫 판에 한 번 알려주면
 * 그 뒤로는 몸이 기억합니다. 매 문제 글로 다시 읽을 것이 아닙니다.
 */
const TONE_NAME: Record<Tone, string> = {
	1: '1성',
	2: '2성',
	3: '3성',
	4: '4성',
	0: '경성',
};

type Phase = 'ready' | 'counting' | 'answer';

type Props = {
	words: Word[];
	dark: boolean;
	onDark: () => void;
	onExit: () => void;
	/** 게임 고르는 화면으로 */
	onBack: () => void;
	teams: Teams;
	/** 놓친 단어를 마무리 화면에 모읍니다 (M) */
	onMiss: (w: Word) => void;
};

export default function ToneGym({ words, dark, onDark, onExit, onBack, teams, onMiss }: Props) {
	// 묶음은 들어올 때 한 번만 뽑습니다. 다시 그릴 때마다 뽑으면
	// 문제가 눈앞에서 바뀝니다.
	const [deck] = useState(() => pickToneDeck(words, ROUND, () => false));

	const [at, setAt] = useState(0);
	const [phase, setPhase] = useState<Phase>('ready');
	const [count, setCount] = useState(COUNT_FROM);
	/** 힌트로 좁혀둔 후보 둘. null 이면 아직 안 켰습니다 */
	const [hint, setHint] = useState<Tone[] | null>(null);

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
			setHint(null);
			return;
		}
		// 세는 중에는 안 받습니다. 아직 아무도 답을 안 했습니다
	}, [phase]);

	const prev = useCallback(() => {
		setAt((i) => Math.max(0, i - 1));
		setPhase('answer'); // 앞 문제는 이미 답을 본 상태로
		setHint(null);
	}, []);

	/**
	 * 힌트 — 넷 중 둘로 좁혀줍니다.
	 *
	 * ★ 병음을 보여줄 수는 없습니다. `ā á ǎ à` 의 기호가 곧 답입니다.
	 *   뜻은 이미 띄우고 있고요(성조와 상관없어서 답이 안 샙니다).
	 *   남는 방법은 후보를 줄이는 것뿐입니다.
	 *
	 * 아무도 손을 못 들어 판이 식을 때 진행자가 씁니다.
	 * 답을 이미 본 뒤에는 켤 일이 없습니다.
	 */
	const showHint = useCallback(() => {
		if (!quiz || phase === 'answer' || hint) return;
		const others = ([1, 2, 3, 4, 0] as Tone[]).filter((t) => t !== quiz.tone);
		const decoy = others[Math.floor(Math.random() * others.length)];
		// 정답이 늘 왼쪽에 오면 두 번째 문제부터 그게 곧 답입니다
		setHint(Math.random() < 0.5 ? [quiz.tone, decoy] : [decoy, quiz.tone]);
	}, [quiz, phase, hint]);

	const showNow = useCallback(() => setPhase('answer'), []);

	// Backspace 는 점수 취소가 씁니다 (shell.tsx). 여기서 겹치게 두면
	// 잘못 센 점수를 지우려다 게임에서 빠져나갑니다.
	useLiveKeys({
		' ': advance,
		ArrowRight: advance,
		ArrowLeft: prev,
		Enter: showNow,
		h: showHint,
		H: showHint,
		m: () => quiz && onMiss(quiz.word),
		M: () => quiz && onMiss(quiz.word),
	});

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
				teams={teams}
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
	const toneName = TONE_NAME[quiz.tone];

	return (
		<LiveFrame
			dark={dark}
			onDark={onDark}
			onExit={onExit}
			badge={`${at + 1} / ${deck.length}`}
			teams={teams}
			controls={
				<>
					<Ctl onClick={prev}>← 이전</Ctl>
					<Ctl onClick={advance} wide>
						{phase === 'ready' ? '하나 둘 셋' : phase === 'counting' ? '…' : '다음 →'}
					</Ctl>
					{phase !== 'answer' && !hint && <Ctl onClick={showHint}>힌트 (H)</Ctl>}
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

				{/* 힌트 — 넷을 둘로 좁혀줍니다 */}
				{hint && phase !== 'answer' && (
					<div className="opacity-60" style={{ fontSize: BIG.line }}>
						{TONE_NAME[hint[0]]} 아니면 {TONE_NAME[hint[1]]}
					</div>
				)}

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
							{toneName}
						</div>
					</div>
				)}
			</div>
		</LiveFrame>
	);
}
