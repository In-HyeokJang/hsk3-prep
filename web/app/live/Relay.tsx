'use client';

import { useCallback, useState } from 'react';
import { pickSpeakDeck } from '@/lib/quiz';
import type { SpokenTone } from '@/lib/pitch';
import type { Word } from '@/lib/types';
import ToneSpeak from '@/components/ToneSpeak';
import { BIG, Ctl, LiveFrame, useLiveKeys, type Teams } from './shell';

/*
  ⑥ 성조 릴레이 (마이크).

  한 명씩 나와 한 글자를 발음합니다. 마이크가 높낮이를 재서 몇 성인지
  가려냅니다. 통과한 사람 수가 팀 점수입니다.

  ★ 진행자 판정이 마이크보다 셉니다.
    마이크 판정은 아직 사람 손으로 검증이 안 됐습니다(09-handoff.md).
    10명 앞에서 오판정이 한 번 나면 그 라운드가 통째로 무너지고,
    "이거 못 믿겠는데" 가 나온 뒤에는 아무도 안 나옵니다.
    그래서 마이크 판정은 **참고로만** 띄우고, 점수는 진행자가 O/X 로 줍니다.

  ★ 자원자만 받습니다.
    화면이 사람을 지목하지 않습니다. 남 앞에서 발음하는 것은 이 모임에서
    가장 무서운 일입니다. 억지로 시키면 그 사람은 다음 모임에 안 옵니다.

  ★ 자리는 매회 맨 뒤 13분입니다.
    한 명씩 하는 형식이라 앞에 두면 나머지 아홉 명이 지루해집니다.
*/

const ROUND = 10;

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

export default function Relay({ words, dark, onDark, onExit, onBack, teams, onMiss }: Props) {
	// 한 글자 · 경성 아닌 것만 골라줍니다. 두 글자를 주면 어느 쪽 성조를
	// 내야 하는지부터 헷갈리고, 재는 쪽도 뒷음절만 떼어낼 수 없습니다.
	const [deck] = useState(() => pickSpeakDeck(words, ROUND));

	const [at, setAt] = useState(0);
	const [team, setTeam] = useState<0 | 1>(0);
	/** 마이크가 뭐라고 했나. 참고용입니다 */
	const [heard, setHeard] = useState<boolean | null>(null);

	const quiz = deck[at];

	const next = useCallback(() => {
		setAt((i) => i + 1);
		setHeard(null);
		// 릴레이는 팀이 번갈아 나옵니다
		setTeam((t) => (t === 0 ? 1 : 0));
	}, []);

	// ★ 진행자 판정. 마이크가 뭐라 했든 이게 이깁니다.
	const judge = useCallback(
		(ok: boolean) => {
			if (ok) teams.add(team);
			else if (quiz) onMiss(quiz.word);
			next();
		},
		[teams, team, next, quiz, onMiss],
	);

	useLiveKeys({
		o: () => judge(true),
		O: () => judge(true),
		x: () => judge(false),
		X: () => judge(false),
		ArrowRight: next,
	});

	const frame = { dark, onDark, onExit, teams };

	if (deck.length === 0) {
		return (
			<LiveFrame {...frame} controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}>
				<p style={{ fontSize: BIG.meaning }}>말해볼 수 있는 한 글자 단어가 없습니다.</p>
			</LiveFrame>
		);
	}

	if (at >= deck.length || !quiz) {
		return (
			<LiveFrame {...frame} controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}>
				<p className="font-bold" style={{ fontSize: BIG.meaning }}>
					릴레이 끝 · {deck.length}명
				</p>
			</LiveFrame>
		);
	}

	return (
		<LiveFrame
			{...frame}
			badge={`${at + 1} / ${deck.length} · ${team + 1}팀`}
			controls={
				<>
					<Ctl onClick={() => judge(true)} wide>
						통과 (O)
					</Ctl>
					<Ctl onClick={() => judge(false)}>아직 (X)</Ctl>
					<Ctl onClick={next}>넘기기 (→)</Ctl>
					<Ctl onClick={onBack}>게임 고르기</Ctl>
				</>
			}
		>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[1.5vmin] text-center">
				<p className="opacity-45" style={{ fontSize: BIG.small }}>
					{team + 1}팀 · <b>자원하는 사람만</b> 나옵니다
				</p>

				{/* 마이크 판정 화면은 이미 있는 것을 그대로 씁니다 */}
				<ToneSpeak
					hanzi={quiz.word.hanzi}
					pinyin={quiz.word.pinyin}
					tone={quiz.tone as SpokenTone}
					onDone={setHeard}
				/>

				{/* 마이크가 뭐라 했는지는 참고로만. 점수는 진행자가 줍니다 */}
				{heard !== null && (
					<p className="opacity-50" style={{ fontSize: BIG.small }}>
						마이크는 {heard ? '맞다' : '아니다'}고 합니다 — <b>판정은 진행자가</b> O/X 로
					</p>
				)}
			</div>
		</LiveFrame>
	);
}
