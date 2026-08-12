'use client';

import { useCallback, useEffect, useState } from 'react';
import { blankSentence, canBlank, makeQuiz, type Quiz } from '@/lib/quiz';
import { speak } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { BIG, Ctl, LiveFrame, Speaker, useLiveKeys, type Teams } from './shell';

/*
  ② 한 글자 빈칸.

  단어를 가린 예문을 크게 띄우고, 보기 4개(한자+병음)에 A~D 를 붙입니다.
  참여자는 손에 든 카드를 동시에 듭니다. 10초.

  ★ 4지선다를 새로 짜지 않습니다.
    `makeQuiz` 를 그대로 부릅니다. 새로 짜면 이미 고쳐놓은 사고를
    처음부터 다시 밟습니다 — 뜻이 같은 보기(把/支), 한자가 겹치는데
    병음이 다른 짝(背·调·精神), 예문에 그 글자가 이미 보이는 보기.
    인덱스 2 를 주면 `makeQuiz` 가 빈칸 문제를 내줍니다.

  ★ 소리는 정답 공개 뒤에만.
    예문을 먼저 읽어주면 가린 자리가 소리로 들립니다.
*/

const ROUND = 8;

/**
 * 카드를 드는 시간.
 *
 * 10초였는데 15초로 늘렸습니다. 초급자가 5m 뒤에서 중국어 예문 한 줄을
 * 읽고 보기 넷을 견주기에 10초는 모자랍니다. "잠깐만요" 가 나오는데
 * 화면은 그대로 답을 열어버립니다.
 */
const LIMIT = 15;
/** 몇 초 남았을 때 뜻을 힌트로 켜나 */
const HINT_AT = 5;

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

export default function Blank({ words, dark, onDark, onExit, onBack, teams, onMiss }: Props) {
	// ★ 필요한 만큼만 문제를 만듭니다.
	//   전에는 973개 전부에 대해 makeQuiz 를 돌린 뒤 8개만 잘라 썼습니다.
	//   보기를 뽑는 규칙이 후보마다 겹침 검사를 하느라 O(n²) 이라,
	//   범위를 '전체' 로 두면 화면이 십여 초 멎었습니다. 열 명 앞에서요.
	const [deck] = useState<Quiz[]>(() => {
		const out: Quiz[] = [];
		for (const w of shuffled(words.filter(canBlank))) {
			if (out.length >= ROUND) break;
			const q = makeQuiz(w, words, 2);
			// makeQuiz 는 조건이 안 맞으면 다른 형식으로 내려갑니다. 빈칸만 씁니다.
			if (q.kind === 'blank') out.push(q);
		}
		return out;
	});

	const [at, setAt] = useState(0);
	const [open, setOpen] = useState(false); // 정답을 공개했나
	const [left, setLeft] = useState(LIMIT);

	const quiz = deck[at];

	/* ── 10초 ─────────────────────────────────────────────── */

	useEffect(() => {
		if (open || !quiz) return;
		if (left <= 0) {
			setOpen(true);
			return;
		}
		const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
		return () => clearTimeout(timer);
	}, [open, left, quiz]);

	/* ── 정답을 공개한 뒤에만 읽어줍니다 ──────────────────── */

	useEffect(() => {
		if (!open || !quiz) return;
		speak(quiz.word.example_zh ?? quiz.word.hanzi);
	}, [open, quiz]);

	/* ── 넘기기 ───────────────────────────────────────────── */

	// ★ 갱신 함수 안에서 다른 상태를 바꾸지 않습니다.
	//   두 번 실행되면 문제가 두 칸씩 뜁니다.
	const next = useCallback(() => {
		if (!open) {
			setOpen(true); // 아직 안 봤으면 먼저 정답부터
			return;
		}
		setAt((i) => i + 1);
		setOpen(false);
		setLeft(LIMIT);
	}, [open]);

	const prev = useCallback(() => {
		setAt((i) => Math.max(0, i - 1));
		setOpen(true); // 앞 문제는 이미 답을 본 상태로
	}, []);

	useLiveKeys({
		' ': next,
		ArrowRight: next,
		ArrowLeft: prev,
		Enter: () => setOpen(true),
		m: () => quiz && onMiss(quiz.word),
		M: () => quiz && onMiss(quiz.word),
	});

	/* ── 그리기 ───────────────────────────────────────────── */

	const frame = { dark, onDark, onExit };

	if (deck.length === 0) {
		return (
			<LiveFrame {...frame} controls={<Ctl onClick={onBack}>게임 고르기</Ctl>}>
				<p style={{ fontSize: BIG.meaning }}>빈칸으로 낼 수 있는 예문이 없습니다.</p>
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

	const hint = !open && left <= HINT_AT;

	return (
		<LiveFrame
			{...frame}
			teams={teams}
			badge={`${at + 1} / ${deck.length}`}
			controls={
				<>
					<Ctl onClick={prev}>← 이전</Ctl>
					<Ctl onClick={next} wide>
						{open ? '다음 →' : '정답'}
					</Ctl>
					{open && <Ctl onClick={() => speak(quiz.word.example_zh ?? '')}>다시 듣기</Ctl>}
					<Ctl onClick={onBack}>게임 고르기</Ctl>
				</>
			}
		>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[2.5vmin] text-center">
				{/* 가린 예문 — 이게 문제입니다 */}
				<div className="han leading-snug" style={{ fontSize: BIG.hanziRow }}>
					{open ? quiz.word.example_zh : blankSentence(quiz.word)}
				</div>

				{!open && (
					<>
						{/* 보기 A~D. 카드를 들 때 부를 이름입니다 */}
						<div className="flex flex-wrap items-stretch justify-center gap-[2vmin]">
							{quiz.choices.map((c, i) => (
								<div
									key={c.id}
									className="flex min-w-[18vmin] flex-col items-center gap-[0.5vmin] rounded-2xl border border-current/20 px-[2.5vmin] py-[1.5vmin]"
								>
									<span className="opacity-40" style={{ fontSize: BIG.small }}>
										{LABELS[i]}
									</span>
									<span className="live-han" style={{ fontSize: BIG.pinyin }}>
										{c.hanzi}
									</span>
									<span className="live-pinyin opacity-60" style={{ fontSize: BIG.small }}>
										{c.pinyin}
									</span>
								</div>
							))}
						</div>

						<div className="flex items-baseline gap-[2vmin]">
							<span
								className="font-bold tabular-nums opacity-70"
								style={{ fontSize: BIG.pinyin }}
							>
								{left}
							</span>
							{/* 힌트는 뜻입니다. 보기를 줄이지 않고 생각할 거리만 줍니다 */}
							{hint && (
								<span className="opacity-55" style={{ fontSize: BIG.line }}>
									뜻: {quiz.word.meaning_ko}
								</span>
							)}
						</div>
					</>
				)}

				{open && (
					<div className="flex flex-col items-center gap-[1.5vmin]">
						<div className="flex items-center gap-[2vmin]">
							<span className="live-pinyin opacity-75" style={{ fontSize: BIG.line }}>
								{quiz.word.example_pinyin ?? quiz.word.pinyin}
							</span>
							{/* 감싸는 것이 버튼이 아니라 형제로 둡니다 */}
							<button
								onClick={() => speak(quiz.word.example_zh ?? '')}
								aria-label="소리 듣기"
								className="shrink-0 rounded-full border border-current/25 p-[1.4vmin] opacity-50 transition-opacity hover:opacity-100"
							>
								<Speaker />
							</button>
						</div>

						<div className="live-han font-bold" style={{ fontSize: BIG.pinyin }}>
							{quiz.word.hanzi}
						</div>
						<div className="font-semibold" style={{ fontSize: BIG.meaning }}>
							{quiz.word.meaning_ko}
						</div>
						{quiz.word.example_ko && (
							<div className="opacity-55" style={{ fontSize: BIG.line }}>
								{quiz.word.example_ko}
							</div>
						)}
					</div>
				)}
			</div>
		</LiveFrame>
	);
}
