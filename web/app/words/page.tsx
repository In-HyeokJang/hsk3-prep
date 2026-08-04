'use client';

import { useMemo, useState } from 'react';
import { filterWords } from '@/lib/api';
import { useStore } from '@/lib/useStore';
import { STATUS_LABEL, type Status } from '@/lib/types';
import { Empty, ErrorBox, Loading, WordRow } from '@/components/ui';

// 거르개는 네 개까지만. 다섯 개가 넘으면 폰에서 줄이 바뀝니다.
// 라벨은 STATUS_LABEL 한 곳에서만 가져옵니다.
// 여기에 따로 적었다가 '아직'/'처음' 으로 갈려서 같은 상태가 두 이름으로 보였습니다.
const FILTERS: { key: 'all' | Status; label: string }[] = [
	{ key: 'all', label: '전체' },
	{ key: 'known', label: STATUS_LABEL.known },
	{ key: 'unknown', label: STATUS_LABEL.unknown },
	{ key: 'new', label: STATUS_LABEL.new },
];

export default function WordsPage() {
	const { words, progress, statusOf, loading, error, reload } = useStore();
	const [q, setQ] = useState('');
	const [filter, setFilter] = useState<'all' | Status>('all');

	const list = useMemo(
		() => (words ? filterWords(words, { q, status: filter, progress }) : []),
		[words, q, filter, progress],
	);

	if (loading) return <Loading />;
	if (error) return <ErrorBox message={error} onRetry={reload} />;

	return (
		<div className="flex flex-col gap-4">
			<h2 className="text-lg font-bold tracking-tight md:text-xl">단어장</h2>

			{/* ── 검색 ── */}
			<div>
				<input
					type="search"
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="뜻이나 병음으로 찾기 — 결정 · juédìng · jueding"
					aria-label="단어 검색"
					className="w-full rounded-xl border border-rule bg-paper-2/60 px-4 py-3 text-base outline-none placeholder:text-muted/70 focus:border-accent"
				/>
				<p className="mt-1.5 text-xs text-muted">
					성조는 빼고 치셔도 됩니다. 한자로 쳐도 찾아요.
				</p>
			</div>

			{/* ── 거르개 ── */}
			<div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
				{FILTERS.map(({ key, label }) => {
					const active = filter === key;
					return (
						<button
							key={key}
							onClick={() => setFilter(key)}
							aria-pressed={active}
							className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
								active
									? 'bg-accent text-paper'
									: 'border border-rule text-ink-2 hover:border-accent'
							}`}
						>
							{label}
						</button>
					);
				})}
			</div>

			<p className="pinyin text-sm tabular-nums text-muted">{list.length}개</p>

			{/* ── 목록 ── */}
			{list.length === 0 ? (
				<Empty
					text={
						q
							? `"${q}" 로 찾은 단어가 없어요.`
							: '이 조건에 맞는 단어가 없어요. 거르개를 바꿔보세요.'
					}
				/>
			) : (
				<ul className="grid gap-2 md:grid-cols-2">
					{list.map((w) => (
						<li key={w.id}>
							<WordRow word={w} status={statusOf(w.id)} />
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
