'use client';

import { useCallback, useEffect, useState } from 'react';
import { speak } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { BIG, Ctl, LiveFrame, Speaker, useLiveKeys, type Teams } from './shell';

/*
  ⑤ 선착순 1명 (옛 이름: 빨리 손들기).

  한자만 크게 띄웁니다. 먼저 손 든 사람이 뜻을 말로 답합니다.

  ★ 문제마다 몇 사람은 쉽니다.
    안 그러면 제일 잘하는 한 명이 스무 문제를 혼자 다 가져갑니다.
    나머지 아홉 명은 두 시간 동안 구경만 하고, 다음 모임에 안 옵니다.
    화면이 쉬는 사람 이름을 띄워서, 그 사람이 손을 안 드는 것이
    눈치가 아니라 규칙이 되게 합니다.

  ★ 쉬는 차례는 **성적과 아무 상관이 없습니다.**
    전에는 '맞힌 사람이 다음 두세 문제를 쉬는' 방식이었습니다. 그런데
    그러면 쉬는 명단이 **거꾸로 된 순위표**가 됩니다 — 열두 문제가 끝나도록
    한 번도 이름이 안 뜬 사람은 **한 번도 못 맞힌 사람**이고, 그게 화면에
    내내 떠 있습니다. 이 프로젝트는 개인 성적을 화면에 안 띄웁니다.

    그래서 쉬는 것을 성적에서 아예 뗐습니다. 게임을 시작할 때 순서를 한 번
    섞어두고 **그 순서대로 돌아가며** 쉽니다. 이름이 뜬 것은 차례가 온 것뿐이라
    잘했는지 못했는지가 안 드러납니다.

    ★ 한 명이 다 가져가는 것은 그대로 막힙니다. 잘하는 사람도 자기 차례에는
      쉬어야 하니까요. 오히려 성적과 무관해서 **반드시** 쉽니다 —
      전에는 못 맞히면 영영 안 쉬었습니다.

    ★ 진행자가 누를 것도 없어집니다. 이름 단추를 눌러 맞힌 사람을 표시하던
      일이 사라집니다. 진행자는 판정과 득점만 보면 됩니다.

  ★ 힌트는 8초에 켭니다.
    아무도 모르는 채로 조용해지는 시간이 길어지면 판이 식습니다.
*/

const ROUND = 12;

/** 몇 초에 힌트를 켜나 */
const HINT_AT = 8;

/**
 * 이 인원보다 적으면 아무도 안 쉽니다.
 *
 * 네 명인데 한 명이 쉬면 셋이 남습니다. 여기서 더 줄이면 남는 사람이
 * 너무 적어서, 아무도 답을 모르면 문제가 그냥 죽습니다.
 */
const MIN_PEOPLE = 4;

/** 한 문제에 몇 사람이 쉬나 — 네 명당 한 명 꼴 (6명→2명 · 10명→3명) */
function howManyRest(people: number): number {
	return Math.max(1, Math.round(people / 4));
}

/**
 * 이 번호 문제에 쉬는 사람들.
 *
 * 섞어둔 순서 위를 창문처럼 미끄러집니다. 끝에 닿으면 앞으로 돌아옵니다.
 * 성적을 아예 안 봅니다 — 그래서 명단이 순위표가 될 수 없습니다.
 */
function restingAt(order: string[], at: number): string[] {
	if (order.length < MIN_PEOPLE) return [];

	const many = howManyRest(order.length);
	const start = (at * many) % order.length;
	return Array.from({ length: many }, (_, i) => order[(start + i) % order.length]);
}

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

	/**
	 * 쉬는 차례. 게임을 시작할 때 **한 번만** 섞습니다.
	 *
	 * 적어준 순서를 그대로 쓰면 안 됩니다 — 앉은 자리나 직급 순서일 수 있고,
	 * 그러면 "왜 늘 나부터냐" 가 나옵니다. 문제마다 다시 섞어도 안 됩니다 —
	 * 어떤 사람은 내리 세 번 쉬고 어떤 사람은 한 번도 안 쉽니다.
	 */
	const [order] = useState(() => shuffled(names));

	const word = deck[at];

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

	const onBreak = restingAt(order, at);
	const nextBreak = restingAt(order, at + 1);

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
				{/* 쉬는 차례 — 크게 띄워야 규칙이 됩니다.
				    '쉬는 중' 이 아니라 '쉬는 차례' 입니다. 성적이 아니라 순서라는 것이
				    말에서도 드러나야 합니다 */}
				{onBreak.length > 0 && (
					<div className="opacity-60" style={{ fontSize: BIG.small }}>
						지금 쉬는 차례 · {onBreak.join(' · ')}
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

						{/* 다음 차례를 미리 알려줍니다. 갑자기 "너 쉬어" 가 되면
						    답을 알고 있던 사람이 김이 샙니다 */}
						{nextBreak.length > 0 && (
							<p className="opacity-30" style={{ fontSize: BIG.small }}>
								다음 문제는 {nextBreak.join(' · ')} 님이 쉽니다
							</p>
						)}
						{names.length > 0 && names.length < MIN_PEOPLE && (
							<p className="opacity-35" style={{ fontSize: BIG.small }}>
								{names.length}명이라 아무도 쉬지 않습니다. 다 같이 답하세요.
							</p>
						)}
						{names.length === 0 && (
							<p className="opacity-35" style={{ fontSize: BIG.small }}>
								시작 화면에서 참여자 이름을 적으면, 차례로 돌아가며 쉬어서 한 사람이 다
								가져가지 않습니다.
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
