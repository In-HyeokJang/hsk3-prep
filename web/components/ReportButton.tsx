'use client';

import { useState } from 'react';
import { REPORT_LABEL, reportWord, type ReportKind } from '@/lib/api';

/**
 * "이거 이상해요" 버튼.
 *
 * 왜 있나:
 *   한자·병음·품사는 공식 목록 그대로라 믿을 수 있지만,
 *   한국어 뜻과 예문 973개는 새로 만든 것이고 사람이 아직 안 봤습니다.
 *   혼자 973개를 검수하는 건 사실상 불가능한데,
 *   쓰는 사람이 이상한 곳에서 한 번 눌러주면 저절로 모입니다.
 *
 * 눈에 띄지 않는 자리에 작게 둡니다. 자주 누를 것이 아니라서요.
 *
 * ★ 눌린 것을 여기서 처리하지 않습니다. 쌓아두기만 하고 나중에 제가 봅니다.
 *   같은 단어는 하루에 한 번만 받습니다 (서버가 막습니다).
 */

const KINDS: ReportKind[] = ['meaning', 'example', 'pinyin', 'other'];

export default function ReportButton({ wordId }: { wordId: string }) {
	const [open, setOpen] = useState(false);
	const [kind, setKind] = useState<ReportKind | null>(null);
	const [note, setNote] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sent, setSent] = useState(false);

	async function go() {
		if (!kind) return;
		setBusy(true);
		setError(null);
		try {
			// 서버가 받았다고 할 때까지 기다립니다.
			// 안 갔는데 "알려주셔서 고맙습니다" 라고 하면 다시는 안 눌러줍니다.
			await reportWord(wordId, kind, note);
			setSent(true);
			setOpen(false);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	if (sent) {
		return (
			<p className="rounded-xl border-l-[3px] border-accent bg-accent-soft px-4 py-3 text-sm text-ink-2">
				알려주셔서 고맙습니다. 확인하고 고치겠습니다.
			</p>
		);
	}

	if (!open) {
		return (
			<button
				onClick={() => {
					setOpen(true);
					setError(null);
				}}
				className="self-center text-xs text-muted underline underline-offset-4"
			>
				이 단어가 이상해요
			</button>
		);
	}

	return (
		<div className="flex flex-col gap-3 rounded-2xl border border-rule-soft bg-paper-2/60 px-4 py-4">
			<p className="text-sm font-semibold">무엇이 이상한가요?</p>

			<div className="flex flex-col gap-2">
				{KINDS.map((k) => (
					<label
						key={k}
						className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3.5 py-3 text-sm ${
							kind === k ? 'border-accent bg-accent-soft' : 'border-rule'
						}`}
					>
						<input
							type="radio"
							name="report-kind"
							checked={kind === k}
							onChange={() => setKind(k)}
							className="size-4 accent-[var(--color-accent)]"
						/>
						{REPORT_LABEL[k]}
					</label>
				))}
			</div>

			<label className="flex flex-col gap-1.5">
				<span className="text-sm text-muted">한마디 (안 써도 됩니다)</span>
				<textarea
					value={note}
					onChange={(e) => setNote(e.target.value)}
					rows={2}
					maxLength={500}
					placeholder="어디가 어떻게 이상한지"
					className="rounded-xl border border-rule bg-paper px-3.5 py-2.5 text-base outline-none focus:border-accent"
				/>
			</label>

			{error && (
				<p className="rounded-xl border-l-[3px] border-warn bg-warn-soft px-3.5 py-2.5 text-sm text-ink-2">
					{error}
				</p>
			)}

			<div className="grid grid-cols-2 gap-2">
				<button
					onClick={() => {
						setOpen(false);
						setKind(null);
						setNote('');
						setError(null);
					}}
					disabled={busy}
					className="rounded-xl border border-rule px-4 py-3 text-sm font-semibold text-ink-2"
				>
					그만두기
				</button>
				<button
					onClick={go}
					disabled={busy || !kind}
					className="rounded-xl bg-accent px-4 py-3 text-sm font-bold text-paper disabled:opacity-40"
				>
					{busy ? '보내는 중...' : '알려주기'}
				</button>
			</div>
		</div>
	);
}
