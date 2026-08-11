'use client';

import { useCallback, useEffect, useState } from 'react';
import { speak } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { BIG, Ctl, LiveFrame, Speaker, useLiveKeys } from './shell';

/*
  ⑦ 다 같이 살리기 — 협동.

  **모든 판의 마지막**입니다. 진 팀도 같은 편으로 끝내고 쉬는 시간에
  들어갑니다. 이게 이 게임이 있는 이유의 전부입니다.

  ★ 경쟁이 없습니다. 팀 점수판을 안 붙입니다.
    여기서까지 팀을 나누면 마지막까지 진 팀이 진 채로 끝납니다.

  ★ 지목은 **화면이** 합니다.
    사람이 지목하면 "왜 나만" 이 나옵니다. 화면이 뽑으면 아무도 원망할
    데가 없습니다. 한 바퀴 돌 때까지 같은 사람을 다시 뽑지 않습니다.

  ★ 상의는 팀 전체가, 마지막 말은 지목된 사람이 합니다.
    이러면 아는 사람이 대신 답해버리는 일이 안 생기고, 모르는 사람도
    15초 동안 배웁니다.
*/

/** 8문제 중 6개면 통과 */
const QUESTIONS = 8;
const NEED = 6;
const LIVES = 3;

/** 팀 전체가 상의하는 시간 */
const TALK_SEC = 15;

type Phase = 'ask' | 'judge' | 'over';

type Props = {
	words: Word[];
	names: string[];
	dark: boolean;
	onDark: () => void;
	onExit: () => void;
	onBack: () => void;
};

/** 뒤섞기 — 한 바퀴 도는 동안 같은 사람이 다시 안 나오게 */
function shuffled<T>(list: T[]): T[] {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

export default function Coop({ words, names, dark, onDark, onExit, onBack }: Props) {
	// 문제와 지목 순서는 들어올 때 한 번만 정합니다.
	// 다시 그릴 때마다 뽑으면 눈앞에서 사람이 바뀝니다.
	const [deck] = useState(() =>
		shuffled(words.filter((w) => w.meaning_ko)).slice(0, QUESTIONS),
	);
	const [order] = useState(() => {
		// 사람 수보다 문제가 많으면 한 바퀴 더 돕니다. 바퀴마다 새로 섞습니다.
		const rounds: string[] = [];
		while (names.length > 0 && rounds.length < QUESTIONS) rounds.push(...shuffled(names));
		return rounds;
	});

	const [at, setAt] = useState(0);
	const [phase, setPhase] = useState<Phase>('ask');
	const [left, setLeft] = useState(TALK_SEC);
	const [right, setRight] = useState(0); // 맞힌 수
	const [lives, setLives] = useState(LIVES);

	const word = deck[at];
	const who = order[at] ?? '아무나';

	/* ── 15초 ─────────────────────────────────────────────── */

	useEffect(() => {
		if (phase !== 'ask') return;
		if (left <= 0) return; // 0에서 멈춥니다. 진행자가 답을 듣고 판정합니다
		const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
		return () => clearTimeout(timer);
	}, [phase, left]);

	/* ── 판정 ─────────────────────────────────────────────── */

	// ★ 갱신 함수 안에서 다른 상태를 바꾸지 않습니다.
	//   두 번 실행되면 목숨이 두 개씩 깎입니다.
	const judge = useCallback(
		(ok: boolean) => {
			if (phase !== 'ask') return;
			if (ok) setRight((n) => n + 1);
			else setLives((n) => n - 1);
			setPhase('judge');
		},
		[phase],
	);

	const next = useCallback(() => {
		if (phase === 'ask') return; // 아직 판정 전입니다
		if (phase === 'over') return;

		const last = at + 1 >= deck.length || lives <= 0;
		if (last) {
			setPhase('over');
			return;
		}
		setAt((i) => i + 1);
		setLeft(TALK_SEC);
		setPhase('ask');
	}, [phase, at, deck.length, lives]);

	useLiveKeys({
		' ': next,
		ArrowRight: next,
		o: () => judge(true),
		O: () => judge(true),
		x: () => judge(false),
		X: () => judge(false),
	});

	/* ── 그리기 ───────────────────────────────────────────── */

	const frame = {
		dark,
		onDark,
		onExit,
	};

	if (deck.length === 0) {
		return (
			<LiveFrame {...frame} controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}>
				<p style={{ fontSize: BIG.meaning }}>낼 수 있는 문제가 없습니다.</p>
			</LiveFrame>
		);
	}

	if (phase === 'over') {
		const won = right >= NEED;
		return (
			<LiveFrame {...frame} controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}>
				<div className="flex flex-col items-center gap-[2vmin] text-center">
					<p className="font-bold" style={{ fontSize: BIG.hanziRow }}>
						{won ? '다 같이 살았습니다' : '아쉽습니다'}
					</p>
					<p style={{ fontSize: BIG.meaning }}>
						{right} / {deck.length} 맞힘 · 목숨 {Math.max(0, lives)}개 남음
					</p>
					<p className="opacity-50" style={{ fontSize: BIG.line }}>
						{won ? '여기까지가 오늘 판의 끝입니다. 쉬는 시간이에요.' : `${NEED}개가 필요했어요.`}
					</p>
				</div>
			</LiveFrame>
		);
	}

	return (
		<LiveFrame
			{...frame}
			badge={`${at + 1} / ${deck.length} · 맞힘 ${right}`}
			controls={
				<>
					{phase === 'ask' ? (
						<>
							<Ctl onClick={() => judge(true)} wide>
								맞음 (O)
							</Ctl>
							<Ctl onClick={() => judge(false)}>틀림 (X)</Ctl>
						</>
					) : (
						<Ctl onClick={next} wide>
							다음 →
						</Ctl>
					)}
					<Ctl onClick={onBack}>게임 고르기</Ctl>
				</>
			}
		>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[2vmin] text-center">
				{/* 목숨 — 남은 것이 한눈에 */}
				<div style={{ fontSize: BIG.line }} className="tracking-[0.3em]">
					{'♥'.repeat(Math.max(0, lives))}
					<span className="opacity-20">{'♥'.repeat(Math.max(0, LIVES - lives))}</span>
				</div>

				{/* 지목 — 이름이 제일 커야 그 사람이 자기라는 걸 압니다 */}
				<div className="font-bold" style={{ fontSize: BIG.meaning }}>
					{who}
				</div>

				<div className="live-han" style={{ fontSize: BIG.hanziRow }}>
					{word.hanzi}
				</div>

				{phase === 'ask' ? (
					<>
						<div
							className="font-bold tabular-nums opacity-70"
							style={{ fontSize: BIG.pinyin }}
						>
							{left}
						</div>
						<p className="opacity-45" style={{ fontSize: BIG.small }}>
							팀 전체가 상의하고, 마지막 말은 {who} 님이
						</p>
					</>
				) : (
					<div className="flex flex-col items-center gap-[1.5vmin]">
						<div className="flex items-center gap-[2vmin]">
							<span className="live-pinyin opacity-80" style={{ fontSize: BIG.pinyin }}>
								{word.pinyin}
							</span>
							{/* 감싸는 것이 버튼이 아니라 형제로 둡니다 */}
							<button
								onClick={() => speak(word.hanzi)}
								aria-label="소리 듣기"
								className="shrink-0 rounded-full border border-current/25 p-[1.4vmin] opacity-50 transition-opacity hover:opacity-100"
							>
								<Speaker />
							</button>
						</div>
						<div className="font-semibold" style={{ fontSize: BIG.meaning }}>
							{word.meaning_ko}
						</div>
					</div>
				)}
			</div>
		</LiveFrame>
	);
}
