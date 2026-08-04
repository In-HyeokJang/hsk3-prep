'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { getDaily } from '@/lib/api';
import { useStore } from '@/lib/useStore';
import { checkTyped, makeQuiz, type Quiz } from '@/lib/quiz';
import type { Status, Word } from '@/lib/types';
import { Empty, ErrorBox, Loading } from '@/components/ui';

const COUNT = 10;

export default function StudyPage() {
	const { userKey, words, statusOf, mark, pendingCount, loading, error, reload } = useStore();

	const [quizzes, setQuizzes] = useState<Quiz[] | null>(null);
	const [at, setAt] = useState(0);

	// 이 카드에 대한 내 답. judged 가 null 이면 아직 안 냈다는 뜻입니다.
	const [typed, setTyped] = useState('');
	const [judged, setJudged] = useState<{ correct: boolean; chosenId: string | null } | null>(null);

	const [result, setResult] = useState<{ known: number; unknown: number }>({
		known: 0,
		unknown: 0,
	});
	const [saving, setSaving] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);

	// ★ statusOf 를 아래 useEffect 의 신호로 쓰면 안 됩니다.
	//   답을 저장할 때마다 내 진도가 바뀌고, statusOf 도 따라서 새것이 됩니다.
	//   그걸 신호로 알아들으면 묶음을 다시 받아 1번 문제로 되돌아갑니다.
	//   그러면 영영 2번 문제로 못 넘어갑니다. 브라우저로 실제로 확인한 일입니다.
	//   그래서 신호로는 쓰지 않고, 값만 여기에 담아두고 꺼내 씁니다.
	const statusOfRef = useRef(statusOf);
	statusOfRef.current = statusOf;

	/** 카드 묶음을 문제로 바꿔서 담아둡니다.
	    한 번만 만들어 둡니다. 그릴 때마다 만들면 보기 순서가 계속 바뀝니다. */
	function startDeck(rows: Word[], pool: Word[]) {
		setQuizzes(rows.map((w, i) => makeQuiz(w, pool, i)));
		setAt(0);
		setTyped('');
		setJudged(null);
	}

	useEffect(() => {
		if (!userKey || !words) return;
		let cancelled = false;

		getDaily(userKey, COUNT)
			.then((rows) => !cancelled && startDeck(rows, words))
			.catch(() => {
				if (cancelled) return;
				startDeck(words.filter((w) => statusOfRef.current(w.id) !== 'known').slice(0, COUNT), words);
			});

		return () => {
			cancelled = true;
		};
	}, [userKey, words]);

	if (loading) return <Loading />;
	if (error) return <ErrorBox message={error} onRetry={reload} />;
	if (!quizzes) return <Loading text="문제를 고르는 중..." />;

	if (quizzes.length === 0) {
		return (
			<div className="flex flex-col gap-4">
				<Empty text="오늘 볼 카드가 없어요. 준비된 단어를 다 외우셨습니다." />
				<Link href="/words" className="text-sm font-medium text-accent">
					단어장 둘러보기 →
				</Link>
			</div>
		);
	}

	/* ── 다 끝났을 때 ── */
	if (at >= quizzes.length) {
		const total = result.known + result.unknown;
		return (
			<div className="flex flex-col items-center gap-6 py-8 text-center">
				<p className="han text-6xl">好</p>
				<div>
					<h2 className="text-2xl font-bold tracking-tight">오늘 몫 끝냈어요</h2>
					<p className="pinyin mt-2 text-lg tabular-nums text-ink-2">
						{total}문제 중 <b className="text-accent">{result.known}개</b> 맞혔어요
					</p>
				</div>

				{result.unknown > 0 && (
					<p className="text-sm text-muted">
						틀린 {result.unknown}개는 다음에 다시 나옵니다. 안 사라져요.
					</p>
				)}

				<div className="flex w-full max-w-xs flex-col gap-2">
					<button
						onClick={() => {
							setResult({ known: 0, unknown: 0 });
							setQuizzes(null);
							getDaily(userKey, COUNT)
								.then((rows) => startDeck(rows, words!))
								.catch(() =>
									startDeck(words!.filter((w) => statusOf(w.id) !== 'known').slice(0, COUNT), words!),
								);
						}}
						className="rounded-xl bg-accent px-5 py-3.5 text-base font-bold text-paper"
					>
						10개 더 하기
					</button>
					<Link
						href="/"
						className="rounded-xl border border-rule px-5 py-3.5 text-base font-semibold text-ink-2"
					>
						오늘 화면으로
					</Link>
				</div>
			</div>
		);
	}

	const quiz = quizzes[at];
	const card = quiz.word;

	/** 답을 냈습니다. 아직 저장하지는 않습니다 — '다음' 을 누를 때 저장합니다. */
	function judge(correct: boolean, chosenId: string | null) {
		if (judged) return;
		setJudged({ correct, chosenId });
	}

	/** 다음 카드로. 여기서 진도를 저장합니다. */
	async function next() {
		if (!judged) return;
		const status: Status = judged.correct ? 'known' : 'unknown';

		setSaving(true);
		setSaveError(null);
		try {
			// 신호가 끊겨 있으면 mark 가 브라우저에 적어두고 null 을 돌려줍니다.
			// 그래도 다음 문제로 넘어갑니다. 지하철에서 1번 문제에 갇히지 않게요.
			await mark(card.id, status, judged.correct);
			setResult((r) => ({
				known: r.known + (judged.correct ? 1 : 0),
				unknown: r.unknown + (judged.correct ? 0 : 1),
			}));
			setTyped('');
			setJudged(null);
			setAt((i) => i + 1);
		} catch (e) {
			// 여기까지 오는 건 로그인이 풀린 것처럼 다시 시도해도 소용없는 경우입니다.
			setSaveError(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(false);
		}
	}

	const kindLabel =
		quiz.kind === 'type' ? '뜻 쓰기' : quiz.kind === 'pick-ko' ? '뜻 고르기' : '한자 고르기';

	return (
		<div className="flex flex-col gap-5">
			{/* ── 진행 ── */}
			<div>
				<div className="mb-1.5 flex items-baseline justify-between">
					<span className="text-sm font-medium">
						학습 <span className="text-muted">· {kindLabel}</span>
					</span>
					<span className="pinyin text-sm tabular-nums text-muted">
						{at + 1} / {quizzes.length}
					</span>
				</div>
				<div className="h-1.5 overflow-hidden rounded-full bg-rule-soft">
					<div
						className="h-full rounded-full bg-accent transition-[width] duration-300"
						style={{ width: `${(at / quizzes.length) * 100}%` }}
					/>
				</div>
			</div>

			{/* ── 문제 ──
			    답을 내면 감춥니다. 아래 정답 카드에 같은 내용이 다 들어 있어서,
			    남겨두면 한자나 뜻이 화면에 두 번 나옵니다. */}
			{!judged && (
				<div className="flex min-h-[13rem] flex-col items-center justify-center gap-4 rounded-2xl border border-rule-soft bg-paper-2/60 px-5 py-8">
					{quiz.kind === 'pick-zh' ? (
						<p className="text-center text-3xl font-bold leading-snug">{card.meaning_ko}</p>
					) : (
						<p className="han text-center text-7xl leading-none md:text-8xl">{card.hanzi}</p>
					)}
					{card.pos && <p className="text-sm text-muted">{card.pos}</p>}
				</div>
			)}

			{/* ── 답하기 ── */}
			{!judged && quiz.kind === 'type' && (
				<form
					onSubmit={(e) => {
						e.preventDefault();
						if (!typed.trim()) return;
						judge(checkTyped(typed, card.meaning_ko), null);
					}}
					className="flex flex-col gap-3"
				>
					<input
						value={typed}
						onChange={(e) => setTyped(e.target.value)}
						autoFocus
						autoComplete="off"
						placeholder="한국어 뜻을 쓰세요"
						aria-label="한국어 뜻"
						className="rounded-xl border border-rule bg-paper px-4 py-4 text-center text-lg outline-none focus:border-accent"
					/>
					<div className="grid grid-cols-2 gap-3">
						<button
							type="button"
							onClick={() => judge(false, null)}
							className="rounded-xl border border-rule px-4 py-4 text-base font-semibold text-ink-2 active:bg-paper-2"
						>
							모르겠어요
						</button>
						<button
							type="submit"
							disabled={!typed.trim()}
							className="rounded-xl bg-accent px-4 py-4 text-base font-semibold text-paper disabled:opacity-40"
						>
							확인
						</button>
					</div>
				</form>
			)}

			{!judged && quiz.kind !== 'type' && (
				<div className="grid gap-2.5">
					{quiz.choices.map((c) => (
						<button
							key={c.id}
							onClick={() => judge(c.id === card.id, c.id)}
							className="rounded-xl border border-rule px-4 py-4 text-center active:bg-paper-2"
						>
							{quiz.kind === 'pick-ko' ? (
								<span className="text-base font-semibold">{c.meaning_ko}</span>
							) : (
								<span className="han text-2xl">{c.hanzi}</span>
							)}
						</button>
					))}
				</div>
			)}

			{/* ── 채점 결과 ── */}
			{judged && (
				<div className="flex flex-col gap-4">
					<div
						className={`rounded-xl border-l-[3px] px-4 py-3 ${
							judged.correct ? 'border-accent bg-paper-2' : 'border-warn bg-warn-soft'
						}`}
					>
						<p className="text-base font-bold">
							{judged.correct ? '맞았어요' : '아쉬워요'}
							{!judged.correct && typed.trim() && (
								<span className="ml-2 text-sm font-normal text-muted">쓰신 답: {typed}</span>
							)}
						</p>
					</div>

					{/* 정답과 함께 이 단어를 통째로 보여줍니다 */}
					<div className="flex flex-col items-center gap-3 rounded-2xl border border-rule-soft bg-paper-2/60 px-5 py-6 text-center">
						<p className="han text-5xl leading-none">{card.hanzi}</p>
						<p className="pinyin text-lg text-accent">{card.pinyin}</p>
						<p className="text-xl font-semibold">{card.meaning_ko}</p>

						{card.example_zh && (
							<div className="mt-2 w-full border-t border-rule-soft pt-4">
								<p className="han text-lg leading-relaxed">{card.example_zh}</p>
								{card.example_pinyin && (
									<p className="pinyin mt-1 text-xs text-accent">{card.example_pinyin}</p>
								)}
								{card.example_ko && <p className="mt-1 text-sm text-ink-2">{card.example_ko}</p>}
							</div>
						)}
					</div>

					<button
						onClick={next}
						disabled={saving}
						className="rounded-xl bg-accent px-5 py-4 text-base font-bold text-paper transition-transform active:scale-[0.99] disabled:opacity-50"
					>
						{at + 1 >= quizzes.length ? '결과 보기' : '다음'}
					</button>
				</div>
			)}

			{/* 신호가 끊겨서 아직 못 보낸 것이 있을 때.
			    "사라진 게 아니라 기다리는 중" 이라고 분명히 말해줍니다. */}
			{pendingCount > 0 && (
				<p className="rounded-xl bg-paper-2 px-4 py-3 text-sm text-muted">
					지금 연결이 안 돼서 <b className="text-ink-2">{pendingCount}개</b>를 아직 못
					보냈어요. 없어지지 않습니다 — 연결되면 알아서 저장됩니다.
				</p>
			)}

			{saveError && (
				<p className="rounded-xl border-l-[3px] border-warn bg-warn-soft px-4 py-3 text-sm text-ink-2">
					<b className="text-warn">저장하지 못했습니다.</b> {saveError}
					<br />
					<span className="text-muted">다음 카드로 넘어가지 않았습니다. 다시 눌러주세요.</span>
				</p>
			)}
		</div>
	);
}
