'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { filterWords, topicsOf } from '@/lib/api';
import { useStore } from '@/lib/useStore';
import { isStarred, STATUS_LABEL, type Status } from '@/lib/types';
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

/** 눌러서 고르는 알약 모양 단추. 상태 거르개와 주제가 같은 모양을 씁니다 */
function Chip({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			onClick={onClick}
			aria-pressed={active}
			className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
				active ? 'bg-accent text-paper' : 'border border-rule text-ink-2 hover:border-accent'
			}`}
		>
			{children}
		</button>
	);
}

export default function WordsPage() {
	const { words, progress, statusOf, starredOf, starCount, loading, error, reload } = useStore();
	const [q, setQ] = useState('');
	const [filter, setFilter] = useState<'all' | Status>('all');
	// null 이면 주제를 안 가립니다
	const [topic, setTopic] = useState<string | null>(null);
	// 별표를 켠 것만 볼지
	const [onlyStar, setOnlyStar] = useState(false);

	// 주제 목록은 자료에서 뽑습니다. 단어가 안 바뀌면 다시 세지 않습니다.
	const topics = useMemo(() => (words ? topicsOf(words) : []), [words]);

	const list = useMemo(() => {
		if (!words) return [];
		const got = filterWords(words, { q, status: filter, topic, progress });
		// 별표는 filterWords 에 넣지 않았습니다. 거기는 "단어가 어떤가" 를 보는 자리이고,
		// 별표는 "내가 표시했나" 라서 결이 다릅니다.
		return onlyStar ? got.filter((w) => isStarred(progress.get(w.id))) : got;
	}, [words, q, filter, topic, onlyStar, progress]);

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
				{FILTERS.map(({ key, label }) => (
					<Chip key={key} active={filter === key} onClick={() => setFilter(key)}>
						{label}
					</Chip>
				))}

				{/* 별표를 하나도 안 눌렀으면 안 보여줍니다. 눌러도 늘 빈 목록이라서요 */}
				{starCount > 0 && (
					<Chip active={onlyStar} onClick={() => setOnlyStar(!onlyStar)}>
						★ 즐겨찾기 <span className="pinyin tabular-nums opacity-60">{starCount}</span>
					</Chip>
				)}
			</div>

			{/* ── 주제 ──
			    주제는 19개라 상태 거르개와 같은 줄에 못 넣습니다. 줄을 따로 두고
			    옆으로 밀어 봅니다. topic 은 973개에 빠짐없이 채워져 있는데 여태 안 썼습니다. */}
			{topics.length > 0 && (
				<div>
					<div className="hide-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
						<Chip active={topic === null} onClick={() => setTopic(null)}>
							주제 전체
						</Chip>
						{topics.map(({ topic: name, count }) => (
							<Chip key={name} active={topic === name} onClick={() => setTopic(name)}>
								{name} <span className="pinyin tabular-nums opacity-60">{count}</span>
							</Chip>
						))}
					</div>
					<p className="mt-1.5 text-xs text-muted">
						옆으로 밀면 주제가 더 있어요.
					</p>
				</div>
			)}

			<div className="flex items-baseline justify-between gap-3">
				<p className="pinyin text-sm tabular-nums text-muted">{list.length}개</p>

				{/* 고른 것만 바로 풀 수 있게. 목록만 보고 끝나면 외워지지 않습니다 */}
				{list.length > 0 && (onlyStar || topic) && (
					<Link
						href={onlyStar ? '/study?only=star' : `/study?topic=${encodeURIComponent(topic!)}`}
						className="shrink-0 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-bold text-paper"
					>
						{onlyStar ? '즐겨찾기만 풀기' : `${topic} 단어만 풀기`} →
					</Link>
				)}
			</div>

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
							<WordRow word={w} status={statusOf(w.id)} starred={starredOf(w.id)} />
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
