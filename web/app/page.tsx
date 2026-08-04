'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getDaily } from '@/lib/api';
import { useStore } from '@/lib/useStore';
import type { Word } from '@/lib/types';
import Withdraw from '@/components/Withdraw';
import { Empty, ErrorBox, Loading, ProgressBar, WordRow } from '@/components/ui';

const TODAY_COUNT = 10;

export default function HomePage() {
	const {
		userKey,
		words,
		statusOf,
		knownCount,
		totalAll,
		ready,
		loading,
		error,
		username,
		signOut,
		reload,
	} = useStore();

	const [daily, setDaily] = useState<Word[] | null>(null);
	const [dailyOffline, setDailyOffline] = useState(false);

	useEffect(() => {
		if (!userKey || !words) return;

		let cancelled = false;

		getDaily(userKey, TODAY_COUNT)
			.then((rows) => {
				if (!cancelled) {
					setDaily(rows);
					setDailyOffline(false);
				}
			})
			.catch(() => {
				// 오늘의 단어는 서버 함수라 신호가 끊기면 못 받아옵니다.
				// 그럴 땐 이미 받아둔 목록에서 아직 안 외운 것으로 채웁니다.
				if (cancelled) return;
				const fallback = words.filter((w) => statusOf(w.id) !== 'known').slice(0, TODAY_COUNT);
				setDaily(fallback);
				setDailyOffline(true);
			});

		return () => {
			cancelled = true;
		};
	}, [userKey, words, statusOf]);

	if (loading) return <Loading />;
	if (error) return <ErrorBox message={error} onRetry={reload} />;

	return (
		<div className="flex flex-col gap-7">
			{/* ── 누구로 들어와 있는지 ── */}
			<div className="flex items-baseline justify-between gap-3 text-sm">
				<span className="min-w-0 truncate text-muted">
					{username && (
						<>
							<b className="text-ink-2">{username}</b> 님
						</>
					)}
				</span>
				<button onClick={signOut} className="shrink-0 text-muted underline underline-offset-4">
					로그아웃
				</button>
			</div>

			{/* ── 진도 ── */}
			<section className="rounded-2xl border border-rule-soft bg-paper-2/60 px-4 py-4 md:px-6 md:py-5">
				<ProgressBar done={knownCount} total={totalAll} label="외운 단어 (HSK 3급 전체)" />
				<p className="mt-3 text-sm text-muted">
					{knownCount === 0
						? '아직 시작 전이에요. 오늘 10개만 해봅시다.'
						: knownCount >= ready
							? '지금 준비된 단어를 다 외우셨어요. 대단합니다.'
							: `${ready - knownCount}개 남았어요. 하루 10개면 ${Math.ceil((ready - knownCount) / 10)}일이에요.`}
				</p>
				{ready < totalAll && (
					<p className="mt-1 text-xs text-muted">
						지금 <b className="text-ink-2">{ready}개</b>까지 뜻과 예문이 준비됐어요. 나머지는
						채워지는 대로 늘어납니다.
					</p>
				)}
			</section>

			{/* ── 시작 버튼 ──
			    목록 아래에 띄워두면 카드를 가립니다. 진도 바로 아래가 자연스러워요.
			    진도 → 시작 → 오늘 볼 것, 순서로 읽힙니다. */}
			{daily && daily.length > 0 && (
				<Link
					href="/study"
					className="rounded-2xl bg-accent px-5 py-4 text-center text-base font-bold text-paper shadow-lg shadow-accent/20 transition-transform active:scale-[0.99] md:self-start md:px-8"
				>
					학습 시작 · {daily.length}개
				</Link>
			)}

			{/* ── 오늘의 단어 ── */}
			<section>
				<div className="mb-3 flex items-baseline justify-between">
					<h2 className="text-lg font-bold tracking-tight md:text-xl">오늘의 단어</h2>
					<span className="text-xs text-muted">자주 쓰는 것부터</span>
				</div>

				{dailyOffline && (
					<p className="mb-3 text-xs text-muted">
						지금 연결이 안 돼서 저장해둔 목록에서 골랐어요.
					</p>
				)}

				{!daily ? (
					<Loading text="오늘의 단어를 고르는 중..." />
				) : daily.length === 0 ? (
					<Empty text="오늘 볼 단어가 없어요. 준비된 단어를 다 외우셨습니다." />
				) : (
					<ul className="flex flex-col gap-2">
						{daily.map((w) => (
							<li key={w.id}>
								<WordRow word={w} status={statusOf(w.id)} />
							</li>
						))}
					</ul>
				)}
			</section>

			{/* ── 탈퇴 ──
			    맨 아래, 눈에 잘 안 띄는 자리에 둡니다. 실수로 누를 일이 아니어서요. */}
			<div className="mt-4 flex flex-col border-t border-rule-soft pt-6">
				<Withdraw username={username} />
			</div>
		</div>
	);
}
