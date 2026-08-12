'use client';

import { useCallback, useMemo, useState } from 'react';
import { sharingHanzi } from '@/lib/api';
import { speak } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { BIG, Ctl, LiveFrame, useLiveKeys, type Teams } from './shell';

/*
  ⑧ 한자 족보 (옛 이름: 한자 가족 열기).

  가운데 글자 하나(`学`)를 크게 띄우고, 그 글자가 든 단어 여덟 개를
  가려둡니다. 팀이 번갈아 대면 한 칸씩 열립니다.

  ★ `sharingHanzi` 를 그대로 씁니다.
    한 글자 단어(学)를 씨앗으로 주면 그 글자가 든 단어들이 빈도순으로
    나오고, 한자가 같은 줄(为 동사 / 为 개사)도 이미 걸러져 있습니다.
    직접 세면 그 함정을 다시 밟습니다.

  ★ 칸은 `1`~`8` 로 엽니다.
    그래서 이 게임만 팀 점수 키(1·2)를 끕니다. 대신 칸을 여는 것이
    곧 그 팀의 득점입니다 — 진행자는 번호만 누르면 됩니다.
*/

/** 한 가족에 칸 몇 개 */
const TILES = 8;
/** 이만큼은 채워져야 게임이 됩니다 */
const MIN_TILES = 5;

type Props = {
	words: Word[];
	/**
	 * 973단어 전부.
	 *
	 * ★ 가족은 **회차 범위가 아니라 전체**에서 찾습니다.
	 *   범위 안에서만 찾으면 여섯 회차 **전부 0개**가 나옵니다 — 973개를
	 *   빈도로 6등분하면 学 이 1회차에 있어도 学校·同学 는 다른 토막에
	 *   흩어지기 때문입니다. 실제로 세어보니 다섯 칸을 채우는 글자가
	 *   회차마다 하나도 없었습니다. 화면에는 "가족을 만들 글자가 없습니다"
	 *   만 떴고요.
	 *
	 *   가운데 글자는 그대로 오늘 범위에서 고르고, 가족만 전체에서 찾습니다.
	 */
	all: Word[];
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

export default function Hanzi({ words, all, dark, onDark, onExit, onBack, teams, onMiss }: Props) {
	// 씨앗은 한 글자 단어입니다. 두 글자를 주면 두 글자의 가족이 섞여서
	// "가운데 글자 하나" 라는 규칙이 깨집니다.
	const families = useMemo(() => {
		const single = (list: Word[]) =>
			list.filter((w) => [...w.hanzi].length === 1 && /^[一-鿿]$/.test(w.hanzi));

		// 가운데 글자는 오늘 범위에서, 가족은 전체에서
		const build = (seeds: Word[]) =>
			shuffled(seeds)
				.map((seed) => ({ seed, family: sharingHanzi(seed, all, TILES) }))
				.filter((f) => f.family.length >= MIN_TILES);

		const here = build(single(words));
		// 오늘 범위에 한 글자 단어가 아예 없는 회차도 있습니다(5·6회차).
		// 그때는 전체에서 고릅니다 — 빈 화면보다는 낫습니다.
		return here.length > 0 ? here : build(single(all));
	}, [words, all]);

	const [at, setAt] = useState(0);
	const [opened, setOpened] = useState<number[]>([]);
	const [turn, setTurn] = useState<0 | 1>(0);

	const here = families[at];

	/* ── 칸 열기 ──────────────────────────────────────────── */

	const open = useCallback(
		(i: number) => {
			if (!here || i >= here.family.length) return;
			if (opened.includes(i)) return;

			setOpened((list) => [...list, i]);
			// 칸을 여는 것이 곧 그 팀의 득점입니다
			teams.add(turn);
			setTurn((t) => (t === 0 ? 1 : 0));
			speak(here.family[i].hanzi);
		},
		[here, opened, teams, turn],
	);

	/** 못 맞혔을 때 — 칸은 그대로 두고 차례만 넘깁니다 */
	const pass = useCallback(() => setTurn((t) => (t === 0 ? 1 : 0)), []);

	const nextFamily = useCallback(() => {
		// 끝까지 안 열린 칸이 곧 오늘 놓친 것입니다
		here?.family.forEach((w, i) => {
			if (!opened.includes(i)) onMiss(w);
		});
		setAt((i) => i + 1);
		setOpened([]);
	}, [here, opened, onMiss]);

	const undo = useCallback(() => {
		// 마지막으로 연 칸을 닫고 점수도 되돌립니다.
		// 두 가지가 짝이라 하나만 되돌리면 점수가 어긋납니다.
		if (opened.length === 0) return;
		setOpened((list) => list.slice(0, -1));
		teams.undo();
		setTurn((t) => (t === 0 ? 1 : 0));
	}, [opened.length, teams]);

	const keys = useMemo(() => {
		const map: Record<string, () => void> = {
			' ': pass,
			ArrowRight: nextFamily,
			Backspace: undo,
		};
		for (let i = 0; i < TILES; i++) map[String(i + 1)] = () => open(i);
		return map;
	}, [pass, nextFamily, undo, open]);

	// 칸을 여는 것은 연달아 칠 일이 없습니다. 잠금을 그대로 둡니다.
	useLiveKeys(keys, ['Backspace']);

	/* ── 그리기 ───────────────────────────────────────────── */

	const frame = { dark, onDark, onExit, teams, teamKeys: false as const };

	if (families.length === 0) {
		return (
			<LiveFrame {...frame} controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}>
				<p style={{ fontSize: BIG.meaning }}>가족을 만들 글자가 없습니다.</p>
			</LiveFrame>
		);
	}

	if (at >= families.length || !here) {
		return (
			<LiveFrame {...frame} controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}>
				<p className="font-bold" style={{ fontSize: BIG.meaning }}>
					글자를 다 돌았습니다
				</p>
			</LiveFrame>
		);
	}

	const allOpen = opened.length >= here.family.length;

	return (
		<LiveFrame
			{...frame}
			badge={`${opened.length} / ${here.family.length} 열림`}
			controls={
				<>
					<Ctl onClick={pass}>차례 넘기기</Ctl>
					<Ctl onClick={undo}>방금 취소</Ctl>
					<Ctl onClick={nextFamily} wide>
						다음 글자 →
					</Ctl>
					<Ctl onClick={onBack}>게임 고르기</Ctl>
				</>
			}
		>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[2.5vmin] text-center">
				{/* 지금 누구 차례인지 — 이게 안 보이면 진행이 엉킵니다 */}
				<div style={{ fontSize: BIG.small }} className="opacity-60">
					{allOpen ? '다 열렸습니다' : `${turn + 1}팀 차례`}
				</div>

				{/* 가운데 글자 */}
				<div className="live-han" style={{ fontSize: BIG.hanziRow }}>
					{here.seed.hanzi}
				</div>
				<div className="opacity-50" style={{ fontSize: BIG.small }}>
					{here.seed.pinyin} · {here.seed.meaning_ko}
				</div>

				{/* 가려진 칸들 */}
				<div className="flex flex-wrap items-stretch justify-center gap-[1.5vmin]">
					{here.family.map((w, i) => {
						const shown = opened.includes(i);
						return (
							<button
								key={w.id}
								onClick={() => open(i)}
								className={`flex min-w-[20vmin] flex-col items-center gap-[0.4vmin] rounded-2xl border px-[2vmin] py-[1.5vmin] transition-colors ${
									shown ? 'border-rule' : 'border-rule-soft bg-paper-2'
								}`}
							>
								{shown ? (
									<>
										<span className="live-han" style={{ fontSize: BIG.line }}>
											{w.hanzi}
										</span>
										<span className="live-pinyin opacity-60" style={{ fontSize: BIG.small }}>
											{w.pinyin}
										</span>
										<span className="opacity-75" style={{ fontSize: BIG.small }}>
											{w.meaning_ko}
										</span>
									</>
								) : (
									<span
										className="font-bold tabular-nums opacity-35"
										style={{ fontSize: BIG.line }}
									>
										{i + 1}
									</span>
								)}
							</button>
						);
					})}
				</div>

				<p className="opacity-35" style={{ fontSize: BIG.small }}>
					번호를 누르면 열립니다 · Space 차례 넘기기 · Backspace 방금 취소
				</p>
			</div>
		</LiveFrame>
	);
}
