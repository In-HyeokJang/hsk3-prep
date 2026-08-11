'use client';

import { useCallback, useEffect, useState } from 'react';
import { speak } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { BIG, Ctl, LiveFrame, Speaker, useLiveKeys, type Teams } from './shell';

/*
  ⑤ 빨리 손들기.

  한자만 크게 띄웁니다. 먼저 손 든 사람이 뜻을 말로 답합니다.

  ★ 맞힌 사람은 다음 몇 문제를 쉽니다.
    이게 이 게임의 전부입니다. 안 그러면 제일 잘하는 한 명이 스무 문제를
    혼자 다 가져갑니다. 나머지 아홉 명은 두 시간 동안 구경만 하고,
    다음 모임에 안 옵니다.
    화면이 쉬는 사람 이름을 띄워서, 그 사람이 손을 안 드는 것이
    눈치가 아니라 규칙이 되게 합니다.

  ★ 힌트는 8초에 켭니다.
    아무도 모르는 채로 조용해지는 시간이 길어지면 판이 식습니다.
*/

const ROUND = 12;

/** 몇 초에 힌트를 켜나 */
const HINT_AT = 8;

type Props = {
	words: Word[];
	names: string[];
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

export default function Hands({ words, names, dark, onDark, onExit, onBack, teams, onMiss }: Props) {
	const [deck] = useState(() => shuffled(words.filter((w) => w.meaning_ko)).slice(0, ROUND));

	const [at, setAt] = useState(0);
	const [open, setOpen] = useState(false);
	const [sec, setSec] = useState(0);

	/** 이름 → 이 번호 문제까지는 쉽니다 */
	const [resting, setResting] = useState<Record<string, number>>({});

	const word = deck[at];

	// 사람이 많으면 더 오래 쉽니다. 열 명인데 두 문제만 쉬면
	// 잘하는 사람이 금방 다시 돌아옵니다.
	const restFor = names.length >= 10 ? 3 : 2;

	/* ── 시간 ─────────────────────────────────────────────── */

	useEffect(() => {
		if (open) return;
		const timer = setTimeout(() => setSec((s) => s + 1), 1000);
		return () => clearTimeout(timer);
	}, [open, sec]);

	/* ── 넘기기 ───────────────────────────────────────────── */

	const next = useCallback(() => {
		if (!open) {
			setOpen(true);
			return;
		}
		setAt((i) => i + 1);
		setOpen(false);
		setSec(0);
	}, [open]);

	const prev = useCallback(() => {
		setAt((i) => Math.max(0, i - 1));
		setOpen(true);
	}, []);

	/** 이 사람이 맞혔습니다 — 다음 몇 문제를 쉽니다 */
	const gotIt = useCallback(
		(name: string) => {
			setResting((r) => ({ ...r, [name]: at + restFor }));
			setOpen(true);
		},
		[at, restFor],
	);

	useLiveKeys({
		' ': next,
		ArrowRight: next,
		ArrowLeft: prev,
		Enter: () => setOpen(true),
		m: () => word && onMiss(word),
		M: () => word && onMiss(word),
	});

	/* ── 그리기 ───────────────────────────────────────────── */

	const frame = { dark, onDark, onExit, teams };

	if (deck.length === 0 || at >= deck.length) {
		return (
			<LiveFrame {...frame} controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}>
				<p className="font-bold" style={{ fontSize: BIG.meaning }}>
					{deck.length === 0 ? '낼 수 있는 문제가 없습니다.' : `한 라운드 끝 · ${deck.length}문제`}
				</p>
			</LiveFrame>
		);
	}

	const onBreak = names.filter((n) => (resting[n] ?? -1) >= at);
	const playing = names.filter((n) => (resting[n] ?? -1) < at);

	return (
		<LiveFrame
			{...frame}
			badge={`${at + 1} / ${deck.length}`}
			controls={
				<>
					<Ctl onClick={prev}>← 이전</Ctl>
					<Ctl onClick={next} wide>
						{open ? '다음 →' : '정답'}
					</Ctl>
					{open && <Ctl onClick={() => speak(word.hanzi)}>다시 듣기</Ctl>}
					<Ctl onClick={onBack}>게임 고르기</Ctl>
				</>
			}
		>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[2vmin] text-center">
				{/* 쉬는 사람 — 크게 띄워야 규칙이 됩니다 */}
				{onBreak.length > 0 && (
					<div className="opacity-60" style={{ fontSize: BIG.small }}>
						쉬는 중 · {onBreak.join(' · ')}
					</div>
				)}

				<div className="live-han" style={{ fontSize: BIG.hanzi }}>
					{word.hanzi}
				</div>

				{!open ? (
					<>
						{/* 8초가 지나면 병음만 켭니다. 뜻은 아직입니다 */}
						{sec >= HINT_AT ? (
							<div className="live-pinyin opacity-70" style={{ fontSize: BIG.pinyin }}>
								{word.pinyin}
							</div>
						) : (
							<div className="tabular-nums opacity-30" style={{ fontSize: BIG.line }}>
								{HINT_AT - sec}
							</div>
						)}

						{/* 맞힌 사람을 눌러주세요 — 그 사람이 다음 문제를 쉽니다 */}
						{playing.length > 0 && (
							<div className="flex flex-wrap items-center justify-center gap-[1vmin]">
								{playing.map((n) => (
									<button
										key={n}
										onClick={() => gotIt(n)}
										className="rounded-xl border border-current/20 px-[1.6vmin] py-[0.8vmin] opacity-55 transition-opacity hover:opacity-100"
										style={{ fontSize: BIG.small }}
									>
										{n}
									</button>
								))}
							</div>
						)}
						{names.length === 0 && (
							<p className="opacity-35" style={{ fontSize: BIG.small }}>
								시작 화면에서 참여자 이름을 적으면, 맞힌 사람이 다음 문제를 쉽니다.
							</p>
						)}
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
