'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { blankSentence, canBlank, makeQuiz, type Quiz } from '@/lib/quiz';
import { speak } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { BIG, Ctl, LiveFrame, Speaker, useLiveKeys, type Teams } from './shell';

/*
  ② 빈칸 스피드 (옛 이름: 빈칸 채우기 · 한 글자 빈칸).

  단어를 가린 예문을 크게 띄우고, 보기 4개(한자+병음)에 A~D 를 붙입니다.

  ★ 4지선다를 새로 짜지 않습니다.
    `makeQuiz` 를 그대로 부릅니다. 새로 짜면 이미 고쳐놓은 사고를
    처음부터 다시 밟습니다 — 뜻이 같은 보기(把/支), 한자가 겹치는데
    병음이 다른 짝(背·调·精神), 예문에 그 글자가 이미 보이는 보기.
    인덱스 2 를 주면 `makeQuiz` 가 빈칸 문제를 내줍니다.

  ★ 시간을 재지 않습니다.
    처음에는 10초, 다음엔 15초를 셌는데 급하게 찍게 만들 뿐이었습니다.
    초급자가 5m 뒤에서 중국어 예문을 읽고 보기 넷을 견주는 데는 그보다
    오래 걸립니다. 다 골랐는지는 진행자가 보고 넘기면 됩니다.

  ★ 보기는 두 번 눌러야 확정됩니다.
    한 번 누르면 고른 표시만 나고, 같은 것을 한 번 더 누르면 확정하고
    정답이 열립니다. 오탭 하나로 그 문제가 날아가지 않게요.

  ★ 소리는 정답 공개 뒤에만.
    예문을 먼저 읽어주면 가린 자리가 소리로 들립니다.
*/

const ROUND = 8;

/** 새 문제가 뜬 뒤 이만큼은 보기를 안 받습니다 (앞 문제의 두 번째 탭 방지) */
const LOCK_MS = 300;

const LABELS = ['A', 'B', 'C', 'D'] as const;
const BLANK = '＿＿';

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

/**
 * 예문 병음에서 그 단어의 병음만 가립니다. 못 가리면 null 입니다.
 *
 * ★ 글자 그대로 찾아 자르면 안 됩니다.
 *   搬(bān) 을 가리려다 帮(bāng) 안의 `bān` 까지 잘려서
 *   `Qǐng ＿＿g wǒ ...` 가 됩니다. 973단어로 확인했더니 이런 자리가
 *   4건 있었습니다.
 *
 *   그래서 **띄어쓰기로 끊은 토막 단위로만** 견줍니다. 문장 첫 글자는
 *   대문자라(`Ànzhào`) 대소문자를 무시하고, 앞뒤 문장부호도 떼어냅니다.
 *
 * ★ 못 가리면 병음을 아예 안 띄웁니다.
 *   `bǎozhù` 처럼 단어 병음이 더 긴 토막에 녹아 있는 경우입니다(25개).
 *   어설프게 띄우면 답이 그대로 보입니다.
 *
 * 973단어 전수 검사: 942개를 가릴 수 있고, **답이 새는 자리 0건,
 * 남의 음절을 잘라먹는 자리 0건**입니다.
 */
function maskPinyin(examplePinyin: string | null, wordPinyin: string): string | null {
	if (!examplePinyin || !wordPinyin) return null;

	const want = wordPinyin.replace(/\s+/g, '').toLowerCase();
	let masked = false;

	const out = examplePinyin.split(/(\s+)/).map((token) => {
		if (/^\s+$/.test(token)) return token;
		const bare = token.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
		if (bare.toLowerCase() !== want) return token;
		masked = true;
		return token.replace(bare, BLANK);
	});

	return masked ? out.join('') : null;
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
	const [picked, setPicked] = useState<number | null>(null); // 고른 보기 (확정 전)
	const [hint, setHint] = useState(false); // 단어 뜻을 켰나

	const quiz = deck[at];

	/* ── 오탭 막기 ────────────────────────────────────────── */

	// 문제가 바뀐 직후에는 보기를 안 받습니다. 앞 문제에서 확정하려고
	// 누른 두 번째 탭이 새 화면의 같은 자리에 떨어지기 때문입니다.
	const lockedUntil = useRef(0);
	useEffect(() => {
		lockedUntil.current = Date.now() + LOCK_MS;
	}, [at]);

	/* ── 정답을 공개한 뒤에만 읽어줍니다 ──────────────────── */

	useEffect(() => {
		if (!open || !quiz) return;
		speak(quiz.word.example_zh ?? quiz.word.hanzi);
	}, [open, quiz]);

	/* ── 고르기 ───────────────────────────────────────────── */

	/**
	 * 보기를 누릅니다.
	 *
	 * 처음 누르면 고른 표시만. 같은 것을 한 번 더 누르면 확정하고 정답이 열립니다.
	 * 다른 것을 누르면 고른 것만 바뀝니다.
	 */
	const tap = useCallback(
		(i: number) => {
			if (open || !quiz) return;
			if (Date.now() < lockedUntil.current) return;

			if (picked !== i) {
				setPicked(i);
				return;
			}

			// 두 번째 탭 — 확정
			setOpen(true);
			// 틀렸으면 진행자가 M 을 안 눌러도 마무리 화면에 담깁니다
			if (quiz.choices[i].id !== quiz.word.id) onMiss(quiz.word);
		},
		[open, quiz, picked, onMiss],
	);

	/* ── 넘기기 ───────────────────────────────────────────── */

	const next = useCallback(() => {
		if (!open) {
			setOpen(true); // 아무도 안 골랐으면 정답부터
			return;
		}
		setAt((i) => i + 1);
		setOpen(false);
		setPicked(null);
		setHint(false);
	}, [open]);

	const prev = useCallback(() => {
		setAt((i) => Math.max(0, i - 1));
		setOpen(true); // 앞 문제는 이미 답을 본 상태로
		setPicked(null);
	}, []);

	useLiveKeys({
		' ': next,
		ArrowRight: next,
		ArrowLeft: prev,
		Enter: () => setOpen(true),
		h: () => setHint(true),
		H: () => setHint(true),
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

	const word = quiz.word;
	const hiddenPinyin = maskPinyin(word.example_pinyin, word.pinyin);
	const answerAt = quiz.choices.findIndex((c) => c.id === word.id);

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
					{!open && !hint && <Ctl onClick={() => setHint(true)}>힌트 (H)</Ctl>}
					{open && <Ctl onClick={() => speak(word.example_zh ?? '')}>다시 듣기</Ctl>}
					<Ctl onClick={onBack}>게임 고르기</Ctl>
				</>
			}
		>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[1.6vmin] text-center">
				{/* 가린 예문 — 이게 문제입니다 */}
				<div className="han leading-snug" style={{ fontSize: BIG.hanziRow }}>
					{open ? word.example_zh : blankSentence(word)}
				</div>

				{/* 병음 — 가린 자리는 병음도 같이 가립니다 */}
				{(open || hiddenPinyin) && (
					<div className="live-pinyin opacity-70" style={{ fontSize: BIG.line }}>
						{open ? (word.example_pinyin ?? '') : hiddenPinyin}
					</div>
				)}

				{/* 예문 한국어 뜻 — 처음부터 보여줍니다.
				    무슨 말인지 알아야 어떤 글자가 들어갈지 생각할 수 있습니다. */}
				{word.example_ko && (
					<div className="opacity-60" style={{ fontSize: BIG.small }}>
						{word.example_ko}
					</div>
				)}

				{!open ? (
					<>
						{/* 보기 A~D.
						    ★ 고른 표시를 보기 '안' 에 넣지 않습니다. 그러면 그 보기가
						      높아지며 아래가 밀려서, 두 번째 탭이 엉뚱한 데 떨어집니다.
						      테두리 굵기를 미리 잡아두고 색만 바꿉니다. */}
						<div className="mt-[1vmin] flex flex-wrap items-stretch justify-center gap-[2vmin]">
							{quiz.choices.map((c, i) => (
								<button
									key={c.id}
									onClick={() => tap(i)}
									className={`flex min-w-[18vmin] flex-col items-center gap-[0.5vmin] rounded-2xl border-2 px-[2.5vmin] py-[1.5vmin] transition-colors ${
										picked === i
											? 'border-accent bg-accent-soft'
											: 'border-rule-soft hover:border-rule'
									}`}
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
								</button>
							))}
						</div>

						{/* 안내는 목록 '바깥' 에, 늘 같은 높이로 */}
						<div
							className="flex h-[4vmin] items-center justify-center opacity-50"
							style={{ fontSize: BIG.small }}
						>
							{picked === null
								? '보기를 누르면 골라지고, 한 번 더 누르면 확정됩니다'
								: `${LABELS[picked]} 를 골랐습니다 — 한 번 더 누르면 확정`}
						</div>

						{hint && (
							<div className="opacity-55" style={{ fontSize: BIG.small }}>
								힌트 · 들어갈 말의 뜻은 &ldquo;{word.meaning_ko}&rdquo;
							</div>
						)}
					</>
				) : (
					<div className="flex flex-col items-center gap-[1.2vmin]">
						{/* 틀렸을 때만 알려줍니다.
						    ★ 맞았으면 아무 말도 안 합니다. 아래에 정답이 그대로 떠 있어서
						      '맞았습니다' 는 한 줄을 더 읽게 할 뿐입니다.
						    ★ A·B 가 아니라 한자로 적습니다. 다섯 걸음 뒤에서 보는 사람에게
						      'B가 답인데 A를 골랐다' 는 아무것도 아닙니다 — 어느 글자였는지가
						      머리에 남아야 합니다. 보기 순서는 다음 문제면 사라집니다. */}
						{picked !== null && picked !== answerAt && (
							<div
								className="flex flex-wrap items-baseline justify-center gap-[1vmin]"
								style={{ fontSize: BIG.line }}
							>
								<span className="live-han opacity-50">{quiz.choices[picked].hanzi}</span>
								<span className="opacity-50">를 골랐고, 답은</span>
								<span className="live-han font-bold">{quiz.choices[answerAt].hanzi}</span>
								<span className="opacity-50">입니다</span>
							</div>
						)}

						<div className="flex items-center gap-[2vmin]">
							<span className="live-han font-bold" style={{ fontSize: BIG.pinyin }}>
								{word.hanzi}
							</span>
							<span className="live-pinyin opacity-70" style={{ fontSize: BIG.line }}>
								{word.pinyin}
							</span>
							{/* 감싸는 것이 버튼이 아니라 형제로 둡니다 */}
							<button
								onClick={() => speak(word.example_zh ?? '')}
								aria-label="소리 듣기"
								className="shrink-0 rounded-full border border-rule p-[1.4vmin] opacity-50 transition-opacity hover:opacity-100"
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
