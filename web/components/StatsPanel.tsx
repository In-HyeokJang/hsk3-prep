'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getStats, type Stats } from '@/lib/api';
import { hitRate, weakWords } from '@/lib/weak';
import type { Progress, Word } from '@/lib/types';

/**
 * 진도 화면.
 *
 * 막대 하나였던 자리를 네 칸으로 바꿉니다.
 *   오늘      푼 개수 · 맞힌 비율 · 며칠 연속
 *   다시 볼 것 오늘 복습할 단어 수 (due_at 이 계산해두고 안 보여주던 것)
 *   상태별    안 본 것 / 배우는 중 / 외운 것
 *   약한 단어  많이 틀린 순 다섯 개
 *
 * 연속 일수를 맨 크게 둡니다. 계속하게 만드는 힘이 제일 큽니다.
 *
 * 숫자를 못 받아와도 화면이 무너지지 않게, 이 칸만 조용히 접습니다.
 * 오늘의 단어까지 같이 사라지면 진도 때문에 공부를 못 하게 됩니다.
 */
export default function StatsPanel({
	words,
	progress,
	totalAll,
}: {
	words: Word[] | null;
	progress: Map<string, Progress>;
	totalAll: number;
}) {
	const [stats, setStats] = useState<Stats | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		getStats()
			.then((s) => !cancelled && setStats(s))
			.catch(() => !cancelled && setFailed(true));
		return () => {
			cancelled = true;
		};
	}, []);

	if (failed) return null;
	if (!stats) {
		return (
			<section className="rounded-2xl border border-rule-soft bg-paper-2/60 px-4 py-6 md:px-6">
				<p className="text-center text-sm text-muted">진도를 세는 중...</p>
			</section>
		);
	}

	const weak = words ? weakWords(words, progress, 5) : [];
	const rate =
		stats.today_total > 0 ? Math.round((stats.today_correct / stats.today_total) * 100) : 0;

	// 세 칸의 폭. 분모는 공식 3급 전체입니다.
	const total = Math.max(totalAll, 1);
	const pct = (n: number) => `${(n / total) * 100}%`;

	return (
		<section className="flex flex-col gap-5 rounded-2xl border border-rule-soft bg-paper-2/60 px-4 py-4 md:px-6 md:py-5">
			{/* ── 오늘 ── */}
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0">
					<p className="text-xs font-semibold tracking-wide text-muted">오늘</p>
					<p className="mt-1 text-base">
						{stats.today_total === 0 ? (
							<span className="text-muted">아직 안 푸셨어요</span>
						) : (
							<>
								<b className="pinyin tabular-nums text-ink">{stats.today_total}문제</b>
								<span className="text-muted"> · </span>
								<span className="pinyin tabular-nums text-accent">{rate}% 맞힘</span>
							</>
						)}
					</p>
				</div>

				{/* 연속 일수. 이 화면에서 제일 큰 글자입니다 */}
				<div className="shrink-0 text-right">
					<p className="pinyin text-3xl font-bold leading-none tabular-nums text-accent">
						{stats.streak_days}
					</p>
					<p className="mt-1 text-[11px] text-muted">일 연속</p>
				</div>
			</div>

			{/* ── 다시 볼 것 ──
			    due_at 은 처음부터 계산해두고 한 번도 안 보여줬습니다 */}
			<Link
				href="/study"
				className="flex items-center justify-between gap-3 rounded-xl border border-rule px-3.5 py-3"
			>
				<span className="text-sm">
					{stats.due_now > 0 ? (
						<>
							오늘 다시 볼 단어{' '}
							<b className="pinyin tabular-nums text-accent">{stats.due_now}개</b>
						</>
					) : (
						<span className="text-muted">지금 복습할 단어는 없어요. 새 단어를 만나실 차례예요</span>
					)}
				</span>
				<span className="shrink-0 text-sm font-semibold text-accent">학습 →</span>
			</Link>

			{/* ── 상태별 ──
			    막대 하나로는 "안 본 것" 과 "배우는 중" 이 구분되지 않습니다 */}
			<div>
				<div className="mb-2 flex h-2.5 overflow-hidden rounded-full bg-rule-soft">
					<span className="bg-accent" style={{ width: pct(stats.known_count) }} />
					<span className="bg-accent/40" style={{ width: pct(stats.learning_count) }} />
				</div>
				<div className="flex justify-between gap-2 text-xs">
					<Legend color="bg-accent" label="외웠어요" n={stats.known_count} />
					<Legend color="bg-accent/40" label="배우는 중" n={stats.learning_count} />
					<Legend color="bg-rule-soft" label="아직 안 본 것" n={stats.new_count} />
				</div>
			</div>

			{/* ── 약한 단어 ──
			    다섯 개만. 더 보고 싶으면 오답 노트로 넘어갑니다 */}
			{weak.length > 0 && (
				<div className="border-t border-rule-soft pt-4">
					<div className="mb-2 flex items-baseline justify-between">
						<p className="text-xs font-semibold tracking-wide text-muted">약한 단어</p>
						<Link href="/review" className="text-xs font-medium text-accent">
							오답 노트 →
						</Link>
					</div>
					<ul className="flex flex-col gap-1">
						{weak.map((w) => (
							<li key={w.word.id}>
								<Link
									href={`/words/${w.word.id}`}
									className="flex items-baseline gap-2 py-1 text-sm"
								>
									<span className="han shrink-0 text-lg">{w.word.hanzi}</span>
									<span className="min-w-0 flex-1 truncate text-ink-2">{w.word.meaning_ko}</span>
									<span className="pinyin shrink-0 text-xs tabular-nums text-muted">
										{w.wrong}번 틀림 · {hitRate(w)}%
									</span>
								</Link>
							</li>
						))}
					</ul>
				</div>
			)}
		</section>
	);
}

function Legend({ color, label, n }: { color: string; label: string; n: number }) {
	return (
		<span className="flex items-center gap-1.5">
			<span className={`size-2 shrink-0 rounded-full ${color}`} />
			<span className="text-muted">{label}</span>
			<b className="pinyin tabular-nums text-ink-2">{n}</b>
		</span>
	);
}
