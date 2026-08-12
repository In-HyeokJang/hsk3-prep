'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { canListen, makePickZh, type Quiz } from '@/lib/quiz';
import { speak, speakTimes } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { BIG, Ctl, LiveFrame, Speaker, useLiveKeys, type Teams } from './shell';

/*
  ③ 받아쓰기 타임 (옛 이름: 귀로 잡기 · 听写).

  한자를 감춘 채 소리만 두 번 들려줍니다.

  ★ 보기는 **한자 4개** 입니다.
    병음을 보기로 내면 소리가 곧 답입니다. 들은 것을 그대로 눈으로
    찾는 일이 되어서 듣기 연습이 아니게 됩니다.

  ★ 상급은 보기를 아예 감춥니다.
    종이에 병음을 받아쓰고 옆 팀과 바꿔 채점합니다. 듣기와 쓰기를
    동시에 칩니다.

  ★ 목소리가 없는 기기면 이 게임을 아예 목록에서 뺍니다 (page.tsx).
    소리가 안 나는 채로 시작하면 10명이 앉아서 기다리게 됩니다.
*/

const ROUND = 8;

/** 처음에 몇 번 들려주나 */
const PLAYS = 2;
/**
 * 그 뒤에 다시 들을 수 있는 횟수.
 *
 * 듣기는 **재생 횟수가 곧 난이도 손잡이**입니다. 초급 모임에서는
 * 한 번으로는 모자라서, 아무도 답을 못 내고 조용해집니다.
 */
const REPLAYS = 2;

/**
 * 두 번 들려줄 때 **다 읽고 나서** 쉬는 시간.
 *
 * ★ 전에는 "첫 소리로부터 2초" 였습니다. `speak()` 은 읽던 것을 끊기 때문에,
 *   `不好意思`(bù hǎo yìsi) 처럼 긴 단어는 2초 안에 다 못 읽고 **첫 번째가
 *   중간에 잘렸습니다.** 듣기 게임에서 문제가 잘리면 그 문제는 못 냅니다.
 *
 *   이제는 시계로 짐작하지 않고 `speak()` 이 알려주는 **끝난 시점**을 씁니다.
 *   짧은 단어는 빨리, 긴 단어는 늦게 두 번째가 나갑니다.
 */
const GAP_MS = 1000;

/**
 * "다 읽었다" 는 신호가 **아예 안 오는 기기**를 위한 예비 시계.
 *
 * 브라우저마다 갈리는 부분이라 확인할 방법이 없습니다. 신호를 못 받으면
 * 두 번째 소리가 영영 안 나오는데, 열 명이 그걸 앉아서 기다리게 됩니다.
 * 이 시간이 지나면 신호가 왔다 치고 그냥 넘어갑니다.
 */
const END_WAIT_MS = 6000;

const LABELS = ['A', 'B', 'C', 'D'] as const;

type Props = {
	words: Word[];
	dark: boolean;
	onDark: () => void;
	onExit: () => void;
	onBack: () => void;
	teams: Teams;
	/** 놓친 단어를 마무리 화면에 모읍니다 (M) */
	onMiss: (w: Word) => void;
};

function shuffled<T>(list: T[]): T[] {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

export default function Listen({ words, dark, onDark, onExit, onBack, teams, onMiss }: Props) {
	// `makePickZh` 가 '뜻 → 한자 4개' 를 내줍니다.
	// 보기 만드는 규칙(뜻이 같은 보기·한자 겹침)은 그대로 물려받습니다.
	//
	// ★ 전에는 `makeQuiz(w, words, 3)` 을 부르고 'pick-zh' 만 주워 담았습니다.
	//   그런데 makeQuiz 는 **쉬운 단어를 입력 문제로 먼저 낚아채서**,
	//   城市(도시)·报(신문)·步(걸음) 같은 것이 전부 빠져나가고
	//   어려운 단어만 남았습니다 (973개 중 393개가 사라짐). quiz.ts 주석 참고.
	//
	// ★ 필요한 만큼만 만듭니다 (Blank.tsx 와 같은 이유 — 전체 범위에서 화면이 멎습니다)
	const [deck] = useState<Quiz[]>(() => {
		const out: Quiz[] = [];
		for (const w of shuffled(words)) {
			if (out.length >= ROUND) break;
			// 괄호가 든 접사는 뺍니다 — 읽어주면 답을 두 번 말합니다
			if (!canListen(w)) continue;
			const q = makePickZh(w, words);
			if (q) out.push(q);
		}
		return out;
	});

	const [at, setAt] = useState(0);
	const [open, setOpen] = useState(false);
	const [hard, setHard] = useState(false); // 상급 — 보기를 감춥니다
	const [replays, setReplays] = useState(REPLAYS);

	const quiz = deck[at];

	/* ── 문제가 바뀌면 두 번 들려줍니다 ───────────────────── */

	/**
	 * 지금 나가고 있는 소리를 그만두게 하는 함수.
	 *
	 * ★ 새 소리를 걸기 전에 반드시 먼저 부릅니다. 안 부르면 **앞 문제의
	 *   '다 읽었다' 신호가 뒤늦게 도착해** 새 문제 위에서 앞 단어가 울립니다.
	 *   (넘어가면서 끊기는 것도 '끝' 이라 신호가 옵니다.)
	 */
	const stopSound = useRef<(() => void) | null>(null);

	const play = useCallback((text: string, times: number) => {
		stopSound.current?.();
		stopSound.current = speakTimes(text, times, GAP_MS, END_WAIT_MS);
	}, []);

	useEffect(() => {
		if (!quiz || open) return;
		play(quiz.word.hanzi, PLAYS);
	}, [quiz, open, play]);

	// 화면을 벗어날 때 예약된 소리를 지웁니다. 안 지우면 게임을 나가도 떠듭니다.
	useEffect(() => {
		const s = stopSound;
		return () => s.current?.();
	}, []);

	/* ── 넘기기 ───────────────────────────────────────────── */

	const next = useCallback(() => {
		if (!open) {
			setOpen(true);
			return;
		}
		setAt((i) => i + 1);
		setOpen(false);
		setReplays(REPLAYS);
	}, [open]);

	const prev = useCallback(() => {
		setAt((i) => Math.max(0, i - 1));
		setOpen(true);
	}, []);

	const again = useCallback(() => {
		if (!quiz) return;
		if (open) return void speak(quiz.word.hanzi); // 공개 뒤에는 마음껏
		if (replays <= 0) return;
		setReplays((n) => n - 1);
		play(quiz.word.hanzi, 1);
	}, [quiz, open, replays, play]);

	useLiveKeys({
		' ': next,
		ArrowRight: next,
		ArrowLeft: prev,
		Enter: () => setOpen(true),
		r: again,
		R: again,
		m: () => quiz && onMiss(quiz.word),
		M: () => quiz && onMiss(quiz.word),
	});

	/* ── 그리기 ───────────────────────────────────────────── */

	const frame = { dark, onDark, onExit };

	if (deck.length === 0) {
		return (
			<LiveFrame {...frame} controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}>
				<p style={{ fontSize: BIG.meaning }}>낼 수 있는 문제가 없습니다.</p>
			</LiveFrame>
		);
	}

	if (at >= deck.length) {
		return (
			<LiveFrame {...frame} teams={teams} controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}>
				<p className="font-bold" style={{ fontSize: BIG.meaning }}>
					한 라운드 끝 · {deck.length}문제
				</p>
			</LiveFrame>
		);
	}

	return (
		<LiveFrame
			{...frame}
			teams={teams}
			badge={`${at + 1} / ${deck.length}`}
			controls={
				<>
					<Ctl onClick={prev}>← 이전</Ctl>
					<Ctl onClick={again}>{open ? '다시 듣기' : `다시 듣기 (${replays})`}</Ctl>
					<Ctl onClick={next} wide>
						{open ? '다음 →' : '정답'}
					</Ctl>
					<Ctl onClick={() => setHard((h) => !h)}>{hard ? '보기 켜기' : '상급 (보기 없이)'}</Ctl>
					<Ctl onClick={onBack}>게임 고르기</Ctl>
				</>
			}
		>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[2.5vmin] text-center">
				{!open ? (
					<>
						{/* 소리가 문제입니다. 한자는 아직 안 보여줍니다 */}
						<button
							onClick={again}
							aria-label="다시 듣기"
							className="rounded-full border border-rule p-[3vmin] opacity-70 transition-opacity hover:opacity-100"
						>
							<Speaker />
						</button>

						{hard ? (
							<p className="opacity-55" style={{ fontSize: BIG.line }}>
								종이에 병음을 받아쓰세요. 옆 팀과 바꿔서 채점합니다.
							</p>
						) : (
							<div className="flex flex-wrap items-stretch justify-center gap-[2vmin]">
								{quiz.choices.map((c, i) => (
									<div
										key={c.id}
										className="flex min-w-[18vmin] flex-col items-center gap-[0.5vmin] rounded-2xl border border-rule px-[2.5vmin] py-[1.5vmin]"
									>
										<span className="opacity-40" style={{ fontSize: BIG.small }}>
											{LABELS[i]}
										</span>
										{/* 보기는 한자만. 병음을 붙이면 소리가 곧 답이 됩니다 */}
										<span className="live-han" style={{ fontSize: BIG.pinyin }}>
											{c.hanzi}
										</span>
									</div>
								))}
							</div>
						)}
					</>
				) : (
					<>
						<div className="live-han" style={{ fontSize: BIG.hanzi }}>
							{quiz.word.hanzi}
						</div>
						<div className="flex items-center gap-[2vmin]">
							<span className="live-pinyin opacity-80" style={{ fontSize: BIG.pinyin }}>
								{quiz.word.pinyin}
							</span>
							{/* 감싸는 것이 버튼이 아니라 형제로 둡니다 */}
							<button
								onClick={again}
								aria-label="소리 듣기"
								className="shrink-0 rounded-full border border-rule p-[1.4vmin] opacity-50 transition-opacity hover:opacity-100"
							>
								<Speaker />
							</button>
						</div>
						<div className="font-semibold" style={{ fontSize: BIG.meaning }}>
							{quiz.word.meaning_ko}
						</div>
					</>
				)}
			</div>
		</LiveFrame>
	);
}
