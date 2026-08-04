import { supabase } from './supabase';
import type { Progress, Status, Summary, Word } from './types';

/* ============================================================
   데이터 읽고 쓰기

   화면에서는 words 표도 examples 표도 직접 보지 않습니다.
   v_words 라는 보기 하나만 읽습니다. 단어와 대표 예문이 이미 한 줄로 붙어 있어요.
   ============================================================ */

/** 한 번 받아온 단어를 기억해둡니다. 973개라 통째로 들고 있어도 가볍습니다. */
let cache: Word[] | null = null;

/**
 * 한국어 뜻이 준비된 단어를 전부 받아옵니다.
 *
 * 왜 통째로 받나:
 *   973개뿐이라 한 번에 받아도 금방입니다.
 *   그러면 검색과 거르개가 서버를 다시 부르지 않고 곧바로 반응합니다.
 *   지하철에서 신호가 끊겨도 이미 받아둔 건 계속 보여요.
 */
export async function getWords(force = false): Promise<Word[]> {
	if (cache && !force) return cache;

	const { data, error } = await supabase
		.from('v_words')
		.select('*')
		.order('frequency', { ascending: true, nullsFirst: false })
		.order('id', { ascending: true })
		.range(0, 1999); // 서버 기본 상한(1000)을 넘겨 받기 위해

	if (error) throw new Error(`단어를 못 받았습니다: ${error.message}`);

	cache = (data ?? []) as Word[];
	return cache;
}

/** 단어 하나 */
export async function getWord(id: string): Promise<Word | null> {
	const all = await getWords();
	return all.find((w) => w.id === id) ?? null;
}

/**
 * 오늘의 단어.
 * 어떤 단어를 고를지는 서버가 정합니다 (daily_words 함수).
 * 다시 볼 때가 된 것 → 자주 틀린 것 → 자주 쓰는 것 순서입니다.
 */
export async function getDaily(userKey: string, limit = 10): Promise<Word[]> {
	const { data, error } = await supabase.rpc('daily_words', {
		p_user_key: userKey,
		p_limit: limit,
	});

	if (error) throw new Error(`오늘의 단어를 못 받았습니다: ${error.message}`);
	return (data ?? []) as Word[];
}

/** 내 진도를 단어 번호로 찾을 수 있게 정리해서 돌려줍니다. */
export async function getProgress(userKey: string): Promise<Map<string, Progress>> {
	if (!userKey) return new Map();

	const { data, error } = await supabase
		.from('progress')
		.select('word_id, status, seen_count, correct_count, wrong_count')
		.eq('user_key', userKey)
		.range(0, 1999);

	if (error) throw new Error(`진도를 못 받았습니다: ${error.message}`);
	return new Map((data ?? []).map((p) => [p.word_id, p as Progress]));
}

/**
 * 단어 하나의 상태를 저장합니다.
 *
 * ★ 서버가 실제로 저장했는지 확인하고 나서 돌려줍니다.
 *   "코드가 에러 없이 끝났다" 와 "저장됐다" 는 다릅니다.
 *   실패했는데 화면에 성공을 띄우면, 나중에 열어봤을 때야 없는 걸 알게 됩니다.
 */
export async function markWord(
	userKey: string,
	wordId: string,
	status: Status,
	correct?: boolean,
): Promise<Progress> {
	if (!userKey) throw new Error('사용자 번호가 없습니다');

	const { data, error } = await supabase.rpc('mark_word', {
		p_user_key: userKey,
		p_word_id: wordId,
		p_status: status,
		p_correct: correct ?? null,
	});

	if (error) throw new Error(`저장하지 못했습니다: ${error.message}`);
	if (!data) throw new Error('저장은 됐다는데 서버가 결과를 안 돌려줬습니다');

	return data as Progress;
}

/** 자료가 얼마나 준비됐는지 */
export async function getSummary(): Promise<Summary> {
	const { data, error } = await supabase.from('v_progress_summary').select('*').single();
	if (error) throw new Error(`요약을 못 받았습니다: ${error.message}`);
	return data as Summary;
}

/* ── 검색 · 거르개 (서버를 다시 부르지 않습니다) ────────────── */

/** 검색어에서 성조·띄어쓰기·기호를 뗍니다. 서버의 pinyin_plain 과 같은 규칙입니다. */
export function plain(s: string): string {
	const from = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü';
	const to = 'aaaaeeeeiiiioooouuuuuuuuu';
	return s
		.toLowerCase()
		.split('')
		.map((ch) => {
			const i = from.indexOf(ch);
			return i === -1 ? ch : to[i];
		})
		.join('')
		.replace(/[^a-z0-9]/g, '');
}

export function filterWords(
	words: Word[],
	{ q, status, progress }: { q: string; status: 'all' | Status; progress: Map<string, Progress> },
): Word[] {
	const query = q.trim();
	const py = plain(query);

	return words.filter((w) => {
		if (status !== 'all') {
			const cur = progress.get(w.id)?.status ?? 'new';
			if (cur !== status) return false;
		}

		if (!query) return true;

		return (
			w.hanzi.includes(query) ||
			w.meaning_ko.includes(query) ||
			(py.length > 0 && (w.pinyin_plain ?? '').includes(py))
		);
	});
}
