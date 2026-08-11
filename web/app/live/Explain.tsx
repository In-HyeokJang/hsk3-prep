'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { sharingHanzi } from '@/lib/api';
import type { Word } from '@/lib/types';
import { BIG, Ctl, LiveFrame, useLiveKeys, type Teams } from './shell';

/*
  ④ 설명해서 맞히기.

  한 명이 **화면에 등을 지고** 앉습니다. 나머지가 **한국어로** 설명해서
  그 단어를 맞히게 합니다. 60초 동안 몇 개나.

  ★ 중국어를 새로 지어낼 필요가 없습니다.
    이 프로젝트에는 중국어를 만들어낼 사람이 없습니다. 그래서 설명은
    한국어로 하고, 화면이 **한자 가족**과 **자료에 있는 예문**을 같이
    띄워줍니다. 있는 재료만 씁니다.

  ★ 금지어는 화면이 대신 지킵니다.
    그 한자·병음·한국어 뜻을 그대로 말하면 안 됩니다. 진행자가
    외우고 있을 수 없으니 화면에 띄워둡니다.

  ★ 등을 진 사람은 화면을 못 봅니다.
    그러니 화면에는 답을 다 적어도 됩니다. 보는 사람은 설명하는 쪽입니다.
*/

/** 한 차례 */
const SECONDS = 60;
/** 한자 가족을 몇 개 띄우나 */
const FAMILY = 3;

type Phase = 'setup' | 'run' | 'done';

type Props = {
	words: Word[];
	dark: boolean;
	onDark: () => void;
	onExit: () => void;
	onBack: () => void;
	teams: Teams;
};

function shuffled<T>(list: T[]): T[] {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

export default function Explain({ words, dark, onDark, onExit, onBack, teams }: Props) {
	const [deck] = useState(() => shuffled(words.filter((w) => w.meaning_ko)));

	const [phase, setPhase] = useState<Phase>('setup');
	const [team, setTeam] = useState<0 | 1>(0);
	const [at, setAt] = useState(0);
	const [left, setLeft] = useState(SECONDS);
	const [got, setGot] = useState(0);

	const word = deck[at];
	const family = useMemo(
		() => (word ? sharingHanzi(word, words, FAMILY) : []),
		[word, words],
	);

	/* ── 60초 ─────────────────────────────────────────────── */

	useEffect(() => {
		if (phase !== 'run') return;
		if (left <= 0) {
			setPhase('done');
			return;
		}
		const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
		return () => clearTimeout(timer);
	}, [phase, left]);

	/* ── 진행 ─────────────────────────────────────────────── */

	const start = useCallback(() => {
		setLeft(SECONDS);
		setGot(0);
		setPhase('run');
	}, []);

	// ★ 갱신 함수 안에서 다른 상태를 바꾸지 않습니다.
	const correct = useCallback(() => {
		if (phase !== 'run') return;
		teams.add(team);
		setGot((n) => n + 1);
		setAt((i) => i + 1);
	}, [phase, teams, team]);

	const pass = useCallback(() => {
		if (phase !== 'run') return;
		setAt((i) => i + 1);
	}, [phase]);

	useLiveKeys({
		' ': () => (phase === 'run' ? correct() : start()),
		ArrowRight: pass,
		Enter: start,
	});

	/* ── 그리기 ───────────────────────────────────────────── */

	const frame = { dark, onDark, onExit, teams };

	if (phase === 'setup' || phase === 'done') {
		return (
			<LiveFrame
				{...frame}
				controls={
					<>
						<Ctl onClick={start} wide>
							{phase === 'done' ? '한 번 더' : '시작'}
						</Ctl>
						<Ctl onClick={onBack}>게임 고르기</Ctl>
					</>
				}
			>
				<div className="flex flex-col items-center gap-[2.5vmin] text-center">
					{phase === 'done' ? (
						<>
							<p className="font-bold" style={{ fontSize: BIG.hanziRow }}>
								{got}개
							</p>
							<p className="opacity-55" style={{ fontSize: BIG.line }}>
								{team + 1}팀 · 60초
							</p>
						</>
					) : (
						<>
							<p className="font-bold" style={{ fontSize: BIG.meaning }}>
								설명해서 맞히기
							</p>
							<p className="opacity-55" style={{ fontSize: BIG.line }}>
								한 명이 화면에 등을 지고 앉습니다. 나머지가 한국어로 설명합니다.
							</p>
						</>
					)}

					{/* 어느 팀 차례인지 먼저 정합니다 */}
					<div className="flex gap-[1.5vmin]">
						{([0, 1] as const).map((t) => (
							<button
								key={t}
								onClick={() => setTeam(t)}
								className={`rounded-xl border px-[2.5vmin] py-[1.2vmin] transition-colors ${
									team === t ? 'border-current/60 bg-current/10' : 'border-current/20 opacity-50'
								}`}
								style={{ fontSize: BIG.small }}
							>
								{t + 1}팀
							</button>
						))}
					</div>

					<p className="opacity-35" style={{ fontSize: BIG.small }}>
						Space 맞힘 · → 통과 · 맞히면 {team + 1}팀에 1점씩 들어갑니다
					</p>
				</div>
			</LiveFrame>
		);
	}

	if (!word) {
		return (
			<LiveFrame {...frame} controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}>
				<p style={{ fontSize: BIG.meaning }}>단어를 다 썼습니다.</p>
			</LiveFrame>
		);
	}

	return (
		<LiveFrame
			{...frame}
			badge={`${team + 1}팀 · ${got}개`}
			controls={
				<>
					<Ctl onClick={correct} wide>
						맞힘 (Space)
					</Ctl>
					<Ctl onClick={pass}>통과 (→)</Ctl>
					<Ctl onClick={() => setPhase('done')}>그만</Ctl>
				</>
			}
		>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[1.5vmin] text-center">
				<div
					className={`font-bold tabular-nums ${left <= 10 ? 'opacity-100' : 'opacity-40'}`}
					style={{ fontSize: BIG.pinyin }}
				>
					{left}
				</div>

				{/* 여기부터가 설명하는 사람들이 보는 것입니다 */}
				<div className="live-han" style={{ fontSize: BIG.hanziRow }}>
					{word.hanzi}
				</div>
				<div className="font-semibold" style={{ fontSize: BIG.meaning }}>
					{word.meaning_ko}
				</div>

				{/* 금지어 — 진행자가 외우고 있을 수 없으니 화면이 지킵니다 */}
				<div
					className="rounded-xl border border-current/20 px-[2vmin] py-[0.8vmin] opacity-60"
					style={{ fontSize: BIG.small }}
				>
					금지 · {word.hanzi} · {word.pinyin} · {word.meaning_ko}
				</div>

				{/* 써도 되는 재료 — 중국어를 새로 지어낼 필요가 없습니다 */}
				{family.length > 0 && (
					<div className="opacity-50" style={{ fontSize: BIG.small }}>
						써도 되는 한자 가족 · {family.map((w) => `${w.hanzi}(${w.meaning_ko})`).join(' · ')}
					</div>
				)}
				{word.example_zh && (
					<div className="han opacity-45" style={{ fontSize: BIG.small }}>
						예문 읽어주기 · {word.example_zh}
					</div>
				)}
			</div>
		</LiveFrame>
	);
}
