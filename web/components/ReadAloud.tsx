'use client';

import { useState } from 'react';
import { compareReading, listenOnce, useCanListen, type ReadResult } from '@/lib/listen';

/**
 * 소리내어 읽기.
 *
 * 단어나 예문을 읽으면, 받아 적은 것과 견줘서 어느 글자를 놓쳤는지 짚어줍니다.
 *
 * ★ 되는 브라우저에서만 나옵니다.
 *   크롬 계열은 되고 파이어폭스는 아예 없습니다. 인터넷도 필요합니다.
 *   안 되는 곳에서 버튼만 보이면 "고장난 사이트" 가 됩니다 (10번과 같은 원칙).
 *
 * ★ 받아 적기는 완벽하지 않습니다.
 *   비슷한 소리를 다른 글자로 적는 일이 흔합니다 (买 mǎi / 卖 mài).
 *   그래서 "틀렸습니다" 라고 단정하지 않고 "몇 글자 맞았나" 로만 말합니다.
 *   기계가 못 알아들은 것을 사람 탓으로 돌리면 안 됩니다.
 */
export default function ReadAloud({ text, label }: { text: string; label: string }) {
	const can = useCanListen();
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<ReadResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	if (!can || !text.trim()) return null;

	async function go() {
		setBusy(true);
		setError(null);
		setResult(null);
		try {
			const said = await listenOnce();
			setResult(compareReading(said, text));
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}

	const rate = result && result.total > 0 ? Math.round((result.hit / result.total) * 100) : 0;

	return (
		<div className="flex flex-col gap-3">
			<button
				onClick={go}
				disabled={busy}
				className="flex items-center justify-center gap-2 rounded-xl border border-rule px-4 py-3.5 text-base font-semibold text-ink-2 active:bg-paper-2 disabled:opacity-60"
			>
				{busy ? '듣는 중... 지금 읽으세요' : `🎤 ${label}`}
			</button>

			{result && (
				<div
					className={`flex flex-col gap-2 rounded-xl border-l-[3px] px-4 py-3 ${
						rate === 100 ? 'border-accent bg-paper-2' : 'border-warn bg-warn-soft'
					}`}
				>
					<p className="text-sm font-bold">
						{rate === 100 ? '다 맞게 읽으셨어요' : `${result.total}자 중 ${result.hit}자`}
					</p>

					{/* 놓친 글자에 색을 칠합니다. 점수만으로는 어디를 고칠지 모릅니다 */}
					<p className="han text-xl leading-relaxed">
						{result.marks.map((m, i) => (
							<span key={i} className={m.hit ? undefined : 'text-warn underline decoration-2'}>
								{m.ch}
							</span>
						))}
					</p>

					<p className="text-xs text-muted">
						이렇게 들었어요: <span className="han text-ink-2">{result.heard || '(못 들음)'}</span>
					</p>

					{rate < 100 && (
						<p className="text-xs text-muted">
							기계가 잘못 받아 적었을 수도 있어요. 소리가 비슷한 글자를 헷갈립니다
							(<span className="han">买</span> mǎi / <span className="han">卖</span> mài).
						</p>
					)}
				</div>
			)}

			{error && (
				<p className="rounded-xl border-l-[3px] border-warn bg-warn-soft px-4 py-3 text-sm text-ink-2">
					{error}
				</p>
			)}
		</div>
	);
}
