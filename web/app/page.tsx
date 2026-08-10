'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getDaily } from '@/lib/api';
import { useStore } from '@/lib/useStore';
import type { Word } from '@/lib/types';
import ChangePassword from '@/components/ChangePassword';
import StatsPanel from '@/components/StatsPanel';
import Withdraw from '@/components/Withdraw';
import {
	DAILY_CHOICES,
	setDailyCount,
	setShowPinyin,
	useDailyCount,
	useShowPinyin,
} from '@/lib/settings';
import { Empty, ErrorBox, Loading, WordRow } from '@/components/ui';

export default function HomePage() {
	const {
		userKey,
		words,
		progress,
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

	// 한 번에 몇 개를 볼지. 아래 설정 칸에서 5·10·20 중 고릅니다.
	const todayCount = useDailyCount();

	const [daily, setDaily] = useState<Word[] | null>(null);
	const [dailyOffline, setDailyOffline] = useState(false);

	useEffect(() => {
		if (!userKey || !words) return;

		let cancelled = false;

		getDaily(userKey, todayCount)
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
				const fallback = words.filter((w) => statusOf(w.id) !== 'known').slice(0, todayCount);
				setDaily(fallback);
				setDailyOffline(true);
			});

		return () => {
			cancelled = true;
		};
		// 학습량을 바꾸면 오늘의 단어도 그만큼으로 다시 받아옵니다.
		// 여기는 문제를 푸는 자리가 아니라 목록이라, 다시 그려도 잃을 게 없습니다.
	}, [userKey, words, statusOf, todayCount]);

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

			{/* ── 진도 ──
			    막대 하나였던 자리입니다. 오늘 · 연속 일수 · 복습할 것 · 상태별 ·
			    약한 단어까지 보여줍니다 (components/StatsPanel.tsx). */}
			<StatsPanel words={words} progress={progress} totalAll={totalAll} />

			<p className="-mt-4 text-sm text-muted">
				{knownCount === 0
					? '아직 시작 전이에요. 오늘 10개만 해봅시다.'
					: knownCount >= ready
						? '지금 준비된 단어를 다 외우셨어요. 대단합니다.'
						: `${ready - knownCount}개 남았어요. 하루 10개면 ${Math.ceil((ready - knownCount) / 10)}일이에요.`}
			</p>

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

			{/* ── 설정 ── */}
			<section className="flex flex-col gap-4 rounded-2xl border border-rule-soft bg-paper-2/40 px-4 py-4 md:px-6 md:py-5">
				<h2 className="text-sm font-bold tracking-tight">설정</h2>
				<PinyinToggle />
				<div className="border-t border-rule-soft pt-4">
					<DailyPicker />
				</div>
				<div className="border-t border-rule-soft pt-4">
					<ChangePassword />
				</div>
			</section>

			{/* ── 탈퇴 ──
			    맨 아래, 눈에 잘 안 띄는 자리에 둡니다. 실수로 누를 일이 아니어서요. */}
			<div className="mt-4 flex flex-col border-t border-rule-soft pt-6">
				<Withdraw username={username} />
			</div>
		</div>
	);
}

/* ── 하루 학습량 ───────────────────────────────────────────
   한 번에 몇 문제를 풀지. 오늘의 단어·학습 화면이 같이 이 값을 씁니다.

   왜 고르게 하나: 10개는 대부분의 날에 맞지만, 못 지키는 날이 이어지면
   아예 안 열게 됩니다. 5개로 낮춰서라도 이어가는 편이 낫습니다.
   반대로 주말에 몰아서 하고 싶은 사람도 있습니다. */
function DailyPicker() {
	const now = useDailyCount();

	return (
		<div className="flex items-center justify-between gap-4">
			<span className="min-w-0">
				<span className="block text-base font-semibold">한 번에 풀 문제 수</span>
				<span className="block text-sm text-muted">
					오늘의 단어와 학습이 이만큼씩 나옵니다. 언제든 바꿀 수 있어요
				</span>
			</span>

			<div className="flex shrink-0 gap-1 rounded-xl bg-paper-2 p-1">
				{DAILY_CHOICES.map((n) => (
					<button
						key={n}
						onClick={() => setDailyCount(n)}
						aria-pressed={now === n}
						className={`pinyin rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums transition-colors ${
							now === n ? 'bg-accent text-paper' : 'text-muted'
						}`}
					>
						{n}
					</button>
				))}
			</div>
		</div>
	);
}

/* ── 병음 켜고 끄기 ────────────────────────────────────────
   손가락으로 누를 스위치입니다. 글자까지 통째로 눌리게 <label> 로 감쌌습니다.
   진짜 체크상자는 눈에 안 보이게 두고 모양만 직접 그립니다 —
   그래야 키보드로도 옮겨 다닐 수 있고, 화면 읽어주는 기계도 알아봅니다. */
function PinyinToggle() {
	const on = useShowPinyin();

	return (
		<label className="flex cursor-pointer items-center justify-between gap-4">
			<span className="min-w-0">
				<span className="block text-base font-semibold">문제에 병음 보이기</span>
				<span className="block text-sm text-muted">
					한자 밑에 <span className="pinyin text-ink-2">xuéxí</span> 처럼 작게 나옵니다.
					한자를 고르는 문제에는 나오지 않아요 (답이 보여서요)
				</span>
			</span>

			<input
				type="checkbox"
				checked={on}
				onChange={(e) => setShowPinyin(e.target.checked)}
				className="peer sr-only"
			/>
			{/* 켜짐/꺼짐 모양은 peer 로 하지 않고 위에서 읽은 on 으로 그립니다.
			    손잡이가 스위치 '안'에 있어서, peer 규칙(형제끼리만)이 닿지 않습니다. */}
			<span
				className={`relative h-7 w-12 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2 ${
					on ? 'bg-accent' : 'bg-rule'
				}`}
			>
				<span
					className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-paper shadow-sm transition-transform ${
						on ? 'translate-x-5' : ''
					}`}
				/>
			</span>
		</label>
	);
}
