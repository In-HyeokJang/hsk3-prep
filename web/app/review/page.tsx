'use client';

import Link from 'next/link';
import { useStore } from '@/lib/useStore';
import { hitRate, weakWords } from '@/lib/weak';
import { Empty, ErrorBox, Loading } from '@/components/ui';

/**
 * 오답 노트.
 *
 * 틀린 횟수(wrong_count)는 처음부터 저장해왔는데 화면에 한 번도 안 나왔습니다.
 * 여기가 그걸 보여주는 자리이고, "이것만 풀기" 로 바로 이어집니다.
 *
 * 서버를 새로 부르지 않습니다. 진도는 useStore 가 이미 받아뒀습니다.
 */

/** 한 번에 몇 개를 보여줄지. 스무 개가 넘어가면 목록이 아니라 벽이 됩니다 */
const SHOW = 20;

export default function ReviewPage() {
	const { words, progress, loading, error, reload } = useStore();

	if (loading) return <Loading />;
	if (error) return <ErrorBox message={error} onRetry={reload} />;
	if (!words) return <Loading />;

	const all = weakWords(words, progress);
	const top = all.slice(0, SHOW);

	if (all.length === 0) {
		return (
			<div className="flex flex-col gap-4">
				<Empty text="아직 틀린 단어가 없어요. 문제를 풀면 여기에 모입니다." />
				<Link href="/study" className="text-sm font-medium text-accent">
					학습하러 가기 →
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-5">
			<div>
				<h2 className="text-xl font-bold tracking-tight">오답 노트</h2>
				<p className="mt-1 text-sm text-muted">
					많이 틀린 순입니다. 지금까지 <b className="text-ink-2">{all.length}개</b>를 틀렸어요.
				</p>
			</div>

			{/* 여기가 이 화면의 핵심입니다. 목록만 보고 끝나면 나아지는 게 없습니다 */}
			<Link
				href="/study?only=wrong"
				className="rounded-xl bg-accent px-5 py-3.5 text-center text-base font-bold text-paper"
			>
				약한 것만 10개 풀기
			</Link>

			<div className="flex flex-col gap-2">
				{top.map((w) => (
					<Link
						key={w.word.id}
						href={`/words/${w.word.id}`}
						className="flex items-center gap-3 rounded-xl border border-rule-soft bg-paper-2/60 px-3.5 py-3 transition-colors hover:border-rule active:bg-paper-2"
					>
						<span className="han w-16 shrink-0 text-2xl leading-tight">{w.word.hanzi}</span>

						<span className="min-w-0 flex-1">
							{/* 把·背 처럼 한자가 같은 단어가 있어서 품사를 병음 옆에 둡니다 */}
							<span className="flex items-baseline gap-1.5">
								<span className="pinyin min-w-0 truncate text-[13px] text-accent">
									{w.word.pinyin}
								</span>
								{w.word.pos && (
									<span className="shrink-0 text-[11px] text-muted">{w.word.pos}</span>
								)}
							</span>
							<span className="block truncate text-sm text-ink-2">{w.word.meaning_ko}</span>
						</span>

						{/* 틀린 횟수를 크게, 맞힌 비율을 작게. 둘 다 있어야 뜻이 통합니다 —
						    세 번 틀렸어도 스무 번 맞혔으면 이야기가 다릅니다 */}
						<span className="shrink-0 text-right">
							<span className="pinyin block text-base font-bold tabular-nums text-warn">
								{w.wrong}번
							</span>
							<span className="pinyin block text-[11px] tabular-nums text-muted">
								{hitRate(w)}% 맞힘
							</span>
						</span>
					</Link>
				))}
			</div>

			{all.length > SHOW && (
				<p className="text-center text-xs text-muted">
					많이 틀린 {SHOW}개만 보여드렸어요. 나머지 {all.length - SHOW}개는 이것들을 정리하면
					올라옵니다.
				</p>
			)}
		</div>
	);
}
