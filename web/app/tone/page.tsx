'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { logAttempt } from '@/lib/api';
import { useStore } from '@/lib/useStore';
import { pickSpeakDeck, pickToneDeck, type Tone, type ToneQuiz } from '@/lib/quiz';
import { splitPinyin, toneVariants } from '@/lib/pinyin';
import type { SpokenTone } from '@/lib/pitch';
import ToneSpeak from '@/components/ToneSpeak';
import { Empty, ErrorBox, Loading } from '@/components/ui';

/**
 * 성조만 몰아서 푸는 자리.
 *
 * 왜 학습(/study) 과 따로 있나:
 *   학습은 "이 단어의 뜻을 아는가" 를 묻습니다. 그 사이에 높낮이를 물으면
 *   머리를 다른 데로 돌려야 해서 둘 다 흐트러집니다.
 *   성조는 버튼 다섯 개로 빠르게 많이 푸는 편이 연습이 됩니다.
 *
 * ★ 여기서는 진도를 건드리지 않습니다.
 *   성조를 틀렸다고 그 단어의 복습 날짜가 3분 뒤로 당겨지면,
 *   뜻은 잘 외우고 있는 단어의 일정이 성조 때문에 망가집니다.
 *   푼 기록(attempts)만 남깁니다. 나중에 "성조만 유독 약하다" 는 거기서 나옵니다.
 */

const COUNT = 20;

/** 말해보기는 한 글자에 시간이 훨씬 오래 걸립니다. 스무 개를 주면 지칩니다 */
const SPEAK_COUNT = 8;

/**
 * 성조 버튼에 붙일 이름과 기호.
 *
 * 숫자만 있으면 몇 성이 어떤 소리인지 떠올리기 어렵습니다.
 * 병음에서 늘 보던 기호를 같이 보여주면 눈에 익은 모양과 이어집니다.
 */
const TONE_BUTTONS: { tone: Tone; mark: string; label: string }[] = [
	{ tone: 1, mark: 'ā', label: '1성' },
	{ tone: 2, mark: 'á', label: '2성' },
	{ tone: 3, mark: 'ǎ', label: '3성' },
	{ tone: 4, mark: 'à', label: '4성' },
	{ tone: 0, mark: 'a', label: '경성' },
];

const LABEL_OF = (t: Tone) => TONE_BUTTONS.find((b) => b.tone === t)?.label ?? '';

/**
 * 이 문제의 보기 다섯 개.
 *
 * ★ 모음 a 로만 낼 수 없습니다.
 *   `ā á ǎ à a` 는 결국 "몇 성입니까" 만 묻는 것이라, 그 단어를 읽는 연습이 안 됩니다.
 *   被 문제라면 `bēi béi běi bèi bei` 여야 실제로 읽어보게 됩니다.
 *
 * 짚은 글자의 음절만 떼어 성조를 갈아끼웁니다 (lib/pinyin.ts).
 * 음절을 못 떼어내면 예전처럼 모음 a 로 돌아갑니다 —
 * 틀린 음절을 보여주느니 덜 친절한 편이 낫습니다.
 *
 * 철자(bei)가 미리 보이는 만큼 문제는 조금 쉬워집니다.
 * 대신 "읽을 줄 아는가 + 몇 성인가" 를 한꺼번에 묻던 것이 성조만 묻는 문제가 됩니다.
 */
function choicesOf(q: ToneQuiz): { tone: Tone; text: string }[] {
	const split = splitPinyin(q.word.pinyin, [...q.word.hanzi].length);
	const variants = split ? toneVariants(split[q.at].text) : null;

	if (variants) return variants.map((v) => ({ tone: v.tone as Tone, text: v.text }));
	return TONE_BUTTONS.map((b) => ({ tone: b.tone, text: b.mark }));
}

/**
 * 눈으로 고르기 / 말해보기.
 *
 * 눈으로 고르기는 "아는가" 를 확인하고, 말해보기는 "낼 수 있는가" 를 고칩니다.
 * 성조는 눈으로 외워지지 않아서 결국 소리를 내봐야 하는데,
 * 소리 내기는 조용한 곳이 필요해서 늘 할 수 있는 게 아닙니다. 그래서 둘 다 둡니다.
 */
function Switch({ how, onChange }: { how: 'pick' | 'speak'; onChange: (v: 'pick' | 'speak') => void }) {
	const item = (v: 'pick' | 'speak', label: string) => (
		<button
			key={v}
			onClick={() => onChange(v)}
			aria-pressed={how === v}
			className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
				how === v ? 'bg-paper text-accent shadow-sm' : 'text-muted'
			}`}
		>
			{label}
		</button>
	);

	return (
		<div className="flex gap-1 rounded-xl bg-paper-2 p-1">
			{item('pick', '눈으로 고르기')}
			{item('speak', '🎤 말해보기')}
		</div>
	);
}

export default function TonePage() {
	const { words, statusOf, loading, error, reload } = useStore();

	// 눈으로 고르기 / 말해보기.
	// 같은 성조를 다루지만 하는 일이 아주 다릅니다 —
	// 하나는 아는지 확인하는 것이고, 하나는 소리를 내서 고치는 것입니다.
	const [how, setHow] = useState<'pick' | 'speak'>('pick');

	const [deck, setDeck] = useState<ToneQuiz[] | null>(null);
	const [at, setAt] = useState(0);
	const [judged, setJudged] = useState<{ correct: boolean; chosen: Tone } | null>(null);
	const [wrong, setWrong] = useState<ToneQuiz[]>([]);

	// 말해보기는 묶음을 따로 씁니다. 한 글자 단어만 쓰기 때문입니다 (quiz.ts 의 pickSpeakDeck)
	const [speakDeck, setSpeakDeck] = useState<ToneQuiz[] | null>(null);
	const [speakAt, setSpeakAt] = useState(0);

	// ★ statusOf 를 아래 useEffect 의 신호로 쓰면 안 됩니다.
	//   진도가 바뀔 때마다 새것이 되어 묶음을 다시 만들고 1번 문제로 되돌아갑니다.
	//   학습 화면에서 실제로 겪은 일입니다 (study/page.tsx 의 같은 자리).
	const statusOfRef = useRef(statusOf);
	statusOfRef.current = statusOf;

	// 이 문제를 띄운 시각. 몇 초 만에 답했는지 재려고 담아둡니다.
	const shownAtRef = useRef(0);

	/** 새 묶음을 만듭니다. 한 번만 만들어 둡니다 — 그릴 때마다 만들면 문제가 계속 바뀝니다. */
	function start(pool: NonNullable<typeof words>) {
		setDeck(pickToneDeck(pool, COUNT, (id) => statusOfRef.current(id) !== 'new'));
		setAt(0);
		setJudged(null);
		setWrong([]);
	}

	useEffect(() => {
		if (!words) return;
		start(words);
		setSpeakDeck(pickSpeakDeck(words, SPEAK_COUNT));
		setSpeakAt(0);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [words]);

	useEffect(() => {
		shownAtRef.current = Date.now();
	}, [at, deck]);

	// 맞혔으면 잠깐 보여주고 알아서 넘어갑니다.
	// 스무 문제를 푸는데 '다음' 을 마흔 번 누르게 하면 흐름이 끊깁니다.
	// 틀렸을 때는 넘어가지 않습니다 — 정답과 병음을 봐야 하니까요.
	useEffect(() => {
		if (!judged?.correct) return;
		const timer = setTimeout(() => {
			setJudged(null);
			setAt((i) => i + 1);
		}, 700);
		return () => clearTimeout(timer);
	}, [judged]);

	if (loading) return <Loading />;
	if (error) return <ErrorBox message={error} onRetry={reload} />;
	if (!deck) return <Loading text="문제를 고르는 중..." />;

	const switcher = <Switch how={how} onChange={setHow} />;

	/* ── 말해보기 ──
	   눈으로 고르는 것과 화면을 나눕니다. 하는 일이 아주 다릅니다 —
	   하나는 아는지 확인하는 것이고, 하나는 소리를 내서 고치는 것입니다. */
	if (how === 'speak') {
		const q = speakDeck?.[speakAt];

		return (
			<div className="flex flex-col gap-5">
				{switcher}

				{!q ? (
					<div className="flex flex-col gap-4">
						<Empty
							text={
								speakDeck && speakDeck.length > 0
									? `${speakDeck.length}개 다 해보셨어요. 잘하셨습니다.`
									: '말해볼 단어를 못 골랐어요.'
							}
						/>
						<button
							onClick={() => {
								if (!words) return;
								setSpeakDeck(pickSpeakDeck(words, SPEAK_COUNT));
								setSpeakAt(0);
							}}
							className="rounded-xl bg-accent px-5 py-3.5 text-base font-bold text-paper"
						>
							다른 글자로 다시
						</button>
					</div>
				) : (
					<>
						<div className="flex items-baseline justify-between">
							<span className="text-sm font-medium">
								성조 <span className="text-muted">· 말해보기</span>
							</span>
							<span className="pinyin text-sm tabular-nums text-muted">
								{speakAt + 1} / {speakDeck!.length}
							</span>
						</div>

						<ToneSpeak
							key={q.word.id}
							hanzi={q.word.hanzi}
							pinyin={q.word.pinyin}
							tone={q.tone as SpokenTone}
							onDone={(correct) => {
								// 진도(progress)는 여기서도 건드리지 않습니다.
								// 성조를 잘못 냈다고 뜻 복습 날짜가 당겨지면 안 됩니다.
								//
								// 유형은 'tone' 입니다. 무엇을 봤나(성조)로 묶어야
								// "성조가 유독 약하다" 를 눈으로 고른 것과 함께 볼 수 있습니다.
								// 어떻게 봤는지(목소리로)는 meta 에 따로 적습니다.
								void logAttempt(q.word.id, 'tone', correct, null, {
									by: 'voice',
									answer: q.tone,
								});
							}}
						/>

						<button
							onClick={() => setSpeakAt((i) => i + 1)}
							className="rounded-xl border border-rule px-5 py-3.5 text-base font-semibold text-ink-2"
						>
							{speakAt + 1 >= speakDeck!.length ? '끝내기' : '다음 글자'}
						</button>
					</>
				)}
			</div>
		);
	}

	if (deck.length === 0) {
		return (
			<div className="flex flex-col gap-4">
				{switcher}
				<Empty text="성조 문제를 만들 단어가 없어요." />
				<Link href="/words" className="text-sm font-medium text-accent">
					단어장 둘러보기 →
				</Link>
			</div>
		);
	}

	/* ── 다 끝났을 때 ── */
	if (at >= deck.length) {
		const right = deck.length - wrong.length;
		return (
			<div className="flex flex-col gap-6 py-4">
				{switcher}
				<div className="flex flex-col items-center gap-4 text-center">
					<p className="han text-6xl">声</p>
					<div>
						<h2 className="text-2xl font-bold tracking-tight">성조 {deck.length}개 끝</h2>
						<p className="pinyin mt-2 text-lg tabular-nums text-ink-2">
							<b className="text-accent">{right}개</b> 맞혔어요
						</p>
					</div>
				</div>

				{/* 틀린 것을 모아서 보여줍니다. 이 화면에서 제일 쓸모 있는 부분입니다 */}
				{wrong.length > 0 && (
					<div className="flex flex-col gap-2">
						<p className="text-sm font-semibold text-ink-2">놓친 것</p>
						{wrong.map((q, i) => (
							<Link
								key={`${q.word.id}-${i}`}
								href={`/words/${q.word.id}`}
								className="flex items-center gap-3 rounded-xl border border-rule-soft bg-paper-2/60 px-3.5 py-3"
							>
								<span className="han w-16 shrink-0 text-2xl">
									{[...q.word.hanzi].map((ch, k) => (
										<span key={k} className={k === q.at ? 'text-warn' : undefined}>
											{ch}
										</span>
									))}
								</span>
								<span className="min-w-0 flex-1">
									<span className="pinyin block truncate text-[13px] text-accent">
										{q.word.pinyin}
									</span>
									<span className="block truncate text-sm text-ink-2">{q.word.meaning_ko}</span>
								</span>
								<span className="shrink-0 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-medium text-warn">
									{LABEL_OF(q.tone)}
								</span>
							</Link>
						))}
					</div>
				)}

				<div className="flex flex-col gap-2">
					<button
						onClick={() => words && start(words)}
						className="rounded-xl bg-accent px-5 py-3.5 text-base font-bold text-paper"
					>
						{COUNT}개 더 하기
					</button>
					<Link
						href="/"
						className="rounded-xl border border-rule px-5 py-3.5 text-center text-base font-semibold text-ink-2"
					>
						오늘 화면으로
					</Link>
				</div>
			</div>
		);
	}

	const q = deck[at];
	const chars = [...q.word.hanzi];

	// 보기 다섯 개. 그릴 때마다 다시 만들지만 뽑기가 없어서 늘 같은 것이 나옵니다.
	// (useEffect 로 담아두면 신호를 하나 더 만드는 셈이라 1번 문제로 되돌아갈 길이 생깁니다)
	const choices = choicesOf(q);

	function answer(chosen: Tone) {
		if (judged) return;
		const correct = chosen === q.tone;

		setJudged({ correct, chosen });
		if (!correct) setWrong((list) => [...list, q]);

		// 기록은 기다리지 않습니다. 늦어도 채점 화면은 바로 떠야 합니다.
		// 실패해도 문제 풀이는 안 멈춥니다 (api.ts 의 logAttempt).
		void logAttempt(q.word.id, 'tone', correct, Date.now() - shownAtRef.current, {
			// 몇 번째 글자를 물었는지. 단어마다 글자가 여러 개라 이게 없으면 나중에 못 읽습니다.
			at: q.at,
			answer: q.tone,
			// 무엇으로 잘못 들었는지. "2성을 자꾸 3성으로 고른다" 가 여기서 나옵니다.
			chosen,
		});
	}

	return (
		<div className="flex flex-col gap-5">
			{switcher}

			{/* ── 진행 ── */}
			<div>
				<div className="mb-1.5 flex items-baseline justify-between">
					<span className="text-sm font-medium">
						성조 <span className="text-muted">· 짚은 글자만</span>
					</span>
					<span className="pinyin text-sm tabular-nums text-muted">
						{at + 1} / {deck.length}
					</span>
				</div>
				<div className="h-1.5 overflow-hidden rounded-full bg-rule-soft">
					<div
						className="h-full rounded-full bg-accent transition-[width] duration-300"
						style={{ width: `${(at / deck.length) * 100}%` }}
					/>
				</div>
			</div>

			{/* ── 문제 ──
			    단어를 통째로 보여주고 그중 한 글자만 짚습니다.
			    한 글자만 떼어 보여주면 背(bēi/bèi)처럼 답이 둘이 되는 글자가 있습니다.
			    뜻은 같이 보여줍니다 — 어느 단어인지 정해주면서 높낮이는 안 알려주니까요.
			    단어 전체의 병음은 답을 낸 뒤에야 나옵니다.
			    (보기에 짚은 글자의 철자는 보이지만, 나머지 글자의 성조까지 알려주지는 않습니다) */}
			<div className="flex min-h-[13rem] flex-col items-center justify-center gap-3 rounded-2xl border border-rule-soft bg-paper-2/60 px-5 py-8">
				<p className="han text-center text-7xl leading-none md:text-8xl">
					{chars.map((ch, i) => (
						<span
							key={i}
							className={
								i === q.at
									? 'text-accent underline decoration-4 underline-offset-[12px]'
									: 'text-muted'
							}
						>
							{ch}
						</span>
					))}
				</p>

				{chars.length > 1 && !judged && (
					<p className="text-xs text-muted">초록색 글자의 성조는?</p>
				)}

				<p className="text-base text-ink-2">{q.word.meaning_ko}</p>
				{q.word.pos && <p className="text-sm text-muted">{q.word.pos}</p>}

				{/* 답을 낸 뒤에 병음을 펼칩니다 */}
				{judged && <p className="pinyin mt-1 text-2xl text-accent">{q.word.pinyin}</p>}
			</div>

			{/* ── 답하기 ──
			    1·2·3·4성을 한 줄에 넷, 경성을 그 아래 한 줄로 나눴습니다.

			    다섯을 한 줄에 넣던 때는 보기가 `ā` 한 글자였습니다.
			    이제 `chuáng` 처럼 여섯 글자가 들어오는데, 폰에서 다섯 칸이면
			    한 칸이 60px 남짓이라 글자가 잘립니다.
			    1~4성은 한 무리이고 경성은 성질이 다르니 의미로도 맞는 자리입니다.

			    ★ 라벨(1성·2성…)은 그대로 둡니다.
			      보기 글자가 바뀌어도 '몇 성인지' 는 여전히 이 문제가 묻는 것이고,
			      채점 칸과 결과 화면이 같은 라벨을 씁니다. */}
			{!judged && (
				<div className="flex flex-col gap-1.5">
					<div className="grid grid-cols-4 gap-1.5">
						{choices
							.filter((c) => c.tone !== 0)
							.map((c) => (
								<button
									key={c.tone}
									onClick={() => answer(c.tone)}
									className="flex flex-col items-center gap-1 rounded-xl border border-rule px-1 py-3.5 active:bg-paper-2"
								>
									<span className="pinyin text-lg leading-none">{c.text}</span>
									<span className="text-[11px] font-semibold text-ink-2">{LABEL_OF(c.tone)}</span>
								</button>
							))}
					</div>

					{choices
						.filter((c) => c.tone === 0)
						.map((c) => (
							<button
								key={c.tone}
								onClick={() => answer(c.tone)}
								className="flex items-center justify-center gap-2 rounded-xl border border-rule px-1 py-3 active:bg-paper-2"
							>
								<span className="pinyin text-lg leading-none">{c.text}</span>
								<span className="text-[11px] font-semibold text-ink-2">{LABEL_OF(c.tone)}</span>
							</button>
						))}
				</div>
			)}

			{/* ── 채점 ── */}
			{judged && (
				<div className="flex flex-col gap-3">
					<div
						className={`rounded-xl border-l-[3px] px-4 py-3 ${
							judged.correct ? 'border-accent bg-paper-2' : 'border-warn bg-warn-soft'
						}`}
					>
						<p className="text-base font-bold">
							{judged.correct ? '맞았어요' : '아쉬워요'}
							{!judged.correct && (
								<span className="ml-2 text-sm font-normal text-muted">
									<span className="han">{chars[q.at]}</span> 는 {LABEL_OF(q.tone)} — {LABEL_OF(judged.chosen)}
									(으)로 고르셨어요
								</span>
							)}
						</p>
					</div>

					{/* 맞혔으면 알아서 넘어가므로 버튼이 필요 없습니다 */}
					{!judged.correct && (
						<button
							onClick={() => {
								setJudged(null);
								setAt((i) => i + 1);
							}}
							className="rounded-xl bg-accent px-5 py-4 text-base font-bold text-paper active:scale-[0.99]"
						>
							{at + 1 >= deck.length ? '결과 보기' : '다음'}
						</button>
					)}
				</div>
			)}
		</div>
	);
}
