// 많이 틀린 단어를 골라내는 규칙.
//
// 오답 노트 화면(/review)과 "약한 것만 풀기"(/study?only=wrong)가
// 같은 규칙을 써야 합니다. 화면에 보이는 목록과 실제로 나오는 문제가
// 다르면 "왜 다른 게 나오지" 가 됩니다.

import type { Progress, Word } from './types';

/** 오답 노트에 한 줄로 나가는 것 */
export type Weak = {
	word: Word;
	/** 틀린 횟수 */
	wrong: number;
	/** 맞힌 횟수 */
	correct: number;
	/** 푼 횟수 */
	seen: number;
};

/** 맞힌 비율 (0~100). 아직 안 푼 단어는 0 */
export function hitRate(w: Weak): number {
	const tried = w.correct + w.wrong;
	return tried > 0 ? Math.round((w.correct / tried) * 100) : 0;
}

/**
 * 많이 틀린 순으로 고릅니다.
 *
 * 한 번도 안 틀린 단어는 아예 넣지 않습니다. 오답 노트니까요.
 *
 * 틀린 횟수가 같으면 맞힌 비율이 낮은 것을 앞에 둡니다.
 * 세 번 틀리고 열 번 맞힌 단어보다, 세 번 틀리고 세 번 맞힌 단어가
 * 지금 더 위험합니다.
 *
 * 그래도 같으면 자주 쓰는 말을 앞세웁니다 (frequency 는 작을수록 자주 씁니다).
 */
export function weakWords(
	words: Word[],
	progress: Map<string, Progress>,
	limit?: number,
): Weak[] {
	const list: Weak[] = [];

	for (const word of words) {
		const p = progress.get(word.id);
		if (!p || p.wrong_count <= 0) continue;
		list.push({
			word,
			wrong: p.wrong_count,
			correct: p.correct_count,
			seen: p.seen_count,
		});
	}

	list.sort((a, b) => {
		if (b.wrong !== a.wrong) return b.wrong - a.wrong;
		const rate = hitRate(a) - hitRate(b);
		if (rate !== 0) return rate;
		return (a.word.frequency ?? 9999) - (b.word.frequency ?? 9999);
	});

	return limit ? list.slice(0, limit) : list;
}
