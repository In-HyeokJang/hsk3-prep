import Link from 'next/link';
import type { Status, Word } from '@/lib/types';

/* ── 진도 막대 ─────────────────────────────────────────────── */

export function ProgressBar({
	done,
	total,
	label,
}: {
	done: number;
	total: number;
	label?: string;
}) {
	const pct = total > 0 ? Math.round((done / total) * 100) : 0;
	return (
		<div>
			<div className="mb-1.5 flex items-baseline justify-between">
				<span className="text-sm text-muted">{label ?? '외운 단어'}</span>
				<span className="pinyin text-sm tabular-nums text-ink-2">
					<b className="text-accent">{done}</b> / {total}
				</span>
			</div>
			<div
				className="h-2 overflow-hidden rounded-full bg-rule-soft"
				role="progressbar"
				aria-valuenow={done}
				aria-valuemin={0}
				aria-valuemax={total}
				aria-label={label ?? '외운 단어'}
			>
				<div
					className="h-full rounded-full bg-accent transition-[width] duration-500"
					style={{ width: `${pct}%` }}
				/>
			</div>
		</div>
	);
}

/* ── 상태 표시 ─────────────────────────────────────────────── */

const PILL: Record<Status, { text: string; cls: string }> = {
	new: { text: '처음', cls: 'bg-rule-soft text-muted' },
	unknown: { text: '모름', cls: 'bg-warn-soft text-warn' },
	learning: { text: '익히는 중', cls: 'bg-rule-soft text-ink-2' },
	known: { text: '외움', cls: 'bg-accent-soft text-accent' },
};

export function StatusPill({ status }: { status: Status }) {
	const p = PILL[status];
	return (
		<span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${p.cls}`}>
			{p.text}
		</span>
	);
}

/* ── 단어 한 줄 ────────────────────────────────────────────── */

export function WordRow({
	word,
	status,
	starred,
}: {
	word: Word;
	status: Status;
	starred?: boolean;
}) {
	return (
		<Link
			href={`/words/${word.id}`}
			className="flex items-center gap-3 rounded-xl border border-rule-soft bg-paper-2/60 px-3.5 py-3 transition-colors hover:border-rule active:bg-paper-2 md:px-4"
		>
			<span className="han w-16 shrink-0 text-2xl leading-tight md:w-20 md:text-3xl">
				{word.hanzi}
			</span>

			{/* 별표는 한자 옆에 작게. 오른쪽 끝에 두면 폰에서 상태 표시와 자리를 다툽니다 */}
			{starred && (
				<span aria-label="즐겨찾기" className="-ml-2 shrink-0 text-sm text-accent">
					★
				</span>
			)}

			<span className="min-w-0 flex-1">
				{/* 같은 한자가 두 번 나오는 단어가 있습니다 (把 개사/양사, 背 bēi/bèi).
				    품사를 같이 보여주지 않으면 똑같은 줄이 두 개인 것처럼 보입니다.
				    그래서 병음 옆에 둡니다 — 오른쪽 끝에 두면 폰에서 자리가 없어 사라집니다. */}
				<span className="flex items-baseline gap-1.5">
					{/* min-w-0 이 없으면 긴 병음이 줄어들지 못해 품사를 화면 밖으로 밀어냅니다 */}
					<span className="pinyin min-w-0 truncate text-[13px] text-accent">{word.pinyin}</span>
					{word.pos && <span className="shrink-0 text-[11px] text-muted">{word.pos}</span>}
				</span>
				<span className="block truncate text-sm text-ink-2">{word.meaning_ko}</span>
			</span>

			<StatusPill status={status} />
		</Link>
	);
}

/* ── 상태 ─────────────────────────────────────────────────── */

export function Loading({ text = '불러오는 중...' }: { text?: string }) {
	return <p className="py-12 text-center text-sm text-muted">{text}</p>;
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
	return (
		<div className="rounded-xl border-l-[3px] border-warn bg-warn-soft px-4 py-3.5">
			<p className="text-sm font-semibold text-warn">불러오지 못했습니다</p>
			<p className="mt-1 text-sm text-ink-2">{message}</p>
			{onRetry && (
				<button
					onClick={onRetry}
					className="mt-3 rounded-lg bg-warn px-3 py-1.5 text-sm font-medium text-white"
				>
					다시 시도
				</button>
			)}
		</div>
	);
}

export function Empty({ text }: { text: string }) {
	return (
		<p className="rounded-xl border border-dashed border-rule px-4 py-10 text-center text-sm text-muted">
			{text}
		</p>
	);
}
