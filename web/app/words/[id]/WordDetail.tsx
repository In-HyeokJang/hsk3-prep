'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStore } from '@/lib/useStore';
import { Empty, ErrorBox, Loading, StatusPill } from '@/components/ui';
import type { Status } from '@/lib/types';

export default function WordDetail({ id }: { id: string }) {
	const { words, statusOf, mark, loading, error, reload } = useStore();
	const [saving, setSaving] = useState<Status | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);

	if (loading) return <Loading />;
	if (error) return <ErrorBox message={error} onRetry={reload} />;

	const word = words?.find((w) => w.id === id);
	if (!word) {
		return (
			<div className="flex flex-col gap-4">
				<Empty text="이 단어를 찾지 못했어요. 아직 한국어 뜻이 준비되지 않은 단어일 수 있습니다." />
				<Link href="/words" className="text-sm font-medium text-accent">
					← 목록으로
				</Link>
			</div>
		);
	}

	const status = statusOf(word.id);

	async function save(next: Status) {
		setSaving(next);
		setSaveError(null);
		try {
			// 서버가 저장했다고 확인해줄 때까지 기다립니다.
			//
			// 맞았는지(correct) 를 넘기지 않습니다. 문제를 푼 게 아니라 손으로 표시한 것이라서요.
			// 정답으로 넘기면 연타할 때마다 연속 기록이 올라가 복습이 35일 뒤로 밀립니다.
			await mark(word!.id, next);
		} catch (e) {
			setSaveError(e instanceof Error ? e.message : String(e));
		} finally {
			setSaving(null);
		}
	}

	return (
		<div className="flex flex-col gap-6">
			<Link href="/words" className="text-sm font-medium text-muted hover:text-accent">
				← 목록으로
			</Link>

			{/* ── 한자 · 田字格 칸 안에 ── */}
			<section className="flex flex-col items-center gap-4">
				<div className="relative grid size-40 place-items-center border-[1.5px] border-rule bg-paper-2/50 md:size-52">
					{/* 한자 연습장의 점선 십자 */}
					<span
						aria-hidden
						className="absolute inset-x-0 top-1/2 h-px"
						style={{
							backgroundImage:
								'repeating-linear-gradient(to right, var(--color-rule) 0 6px, transparent 6px 12px)',
						}}
					/>
					<span
						aria-hidden
						className="absolute inset-y-0 left-1/2 w-px"
						style={{
							backgroundImage:
								'repeating-linear-gradient(to bottom, var(--color-rule) 0 6px, transparent 6px 12px)',
						}}
					/>
					<span className="han relative text-6xl leading-none md:text-8xl">{word.hanzi}</span>
				</div>

				<div className="flex flex-col items-center gap-1.5">
					<p className="pinyin text-xl text-accent md:text-2xl">{word.pinyin}</p>
					<div className="flex items-center gap-2">
						{word.pos && <span className="text-sm text-muted">{word.pos}</span>}
						<StatusPill status={status} />
					</div>
				</div>

				<p className="text-center text-xl font-semibold md:text-2xl">{word.meaning_ko}</p>
			</section>

			{/* ── 예문 ── */}
			{word.example_zh && (
				<section className="rounded-2xl border border-rule-soft bg-paper-2/60 px-4 py-4 md:px-6 md:py-5">
					<p className="mb-3 text-xs font-semibold tracking-wide text-muted">예문</p>
					<p className="han mb-2 text-xl leading-relaxed md:text-2xl">
						{highlight(word.example_zh, word.hanzi)}
					</p>
					{word.example_pinyin && (
						<p className="pinyin mb-2 text-sm text-accent">{word.example_pinyin}</p>
					)}
					{word.example_ko && <p className="text-sm text-ink-2">{word.example_ko}</p>}
				</section>
			)}

			{/* ── 외웠는지 ── */}
			<section className="flex flex-col gap-3">
				<div className="grid grid-cols-2 gap-3">
					<button
						onClick={() => save('unknown')}
						disabled={saving !== null}
						className="rounded-xl border border-rule px-4 py-3.5 text-base font-semibold text-ink-2 transition-colors active:bg-paper-2 disabled:opacity-50"
					>
						{saving === 'unknown' ? '저장 중...' : '아직이요'}
					</button>
					<button
						onClick={() => save('known')}
						disabled={saving !== null}
						className="rounded-xl bg-accent px-4 py-3.5 text-base font-semibold text-paper transition-transform active:scale-[0.99] disabled:opacity-50"
					>
						{saving === 'known' ? '저장 중...' : '외웠어요'}
					</button>
				</div>

				{saveError && (
					<p className="rounded-xl border-l-[3px] border-warn bg-warn-soft px-4 py-3 text-sm text-ink-2">
						<b className="text-warn">저장하지 못했습니다.</b> {saveError}
						<br />
						<span className="text-muted">
							화면만 바꾸지 않았습니다. 다시 눌러주세요.
						</span>
					</p>
				)}
			</section>

			<p className="pinyin text-center text-xs text-muted">
				{word.id}
				{word.frequency ? ` · 빈도 ${word.frequency}위` : ''}
			</p>
		</div>
	);
}

/**
 * 예문 안에서 지금 배우는 단어에 색을 칠합니다.
 * 예문에 그 글자가 어디 있는지 눈에 안 들어오면 예문이 제 역할을 못 합니다.
 */
function highlight(sentence: string, target: string) {
	if (!target) return sentence;

	const parts: React.ReactNode[] = [];
	let rest = sentence;
	let key = 0;

	while (rest.length > 0) {
		const at = rest.indexOf(target);
		if (at === -1) {
			parts.push(rest);
			break;
		}
		if (at > 0) parts.push(rest.slice(0, at));
		parts.push(
			<b key={key++} className="text-accent">
				{target}
			</b>,
		);
		rest = rest.slice(at + target.length);
	}

	return parts;
}
