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
		// meta 에는 연속 정답 횟수(streak)와 별표(star)가 들어 있습니다
		.select('word_id, status, seen_count, correct_count, wrong_count, meta')
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

/**
 * 즐겨찾기 별표를 켜고 끕니다.
 *
 * ★ 복습 일정을 건드리지 않습니다. 서버가 `meta.star` 하나만 바꿉니다.
 *   별표는 "나중에 다시 보고 싶다" 는 표시일 뿐이라, 누른다고 다음에 볼
 *   날짜가 당겨지거나 밀리면 표시를 할수록 일정이 망가집니다 (마이그레이션 21).
 */
export async function starWord(wordId: string, on: boolean): Promise<Progress> {
	const { data, error } = await supabase.rpc('star_word', {
		p_word_id: wordId,
		p_on: on,
	});

	if (error) throw new Error(`별표를 저장하지 못했습니다: ${error.message}`);
	if (!data) throw new Error('별표는 저장했다는데 서버가 결과를 안 돌려줬습니다');
	return data as Progress;
}

/* ── 푼 기록 ────────────────────────────────────────────────
   진도(progress)와 다릅니다. 진도는 덮어쓰고, 이건 쌓입니다.
   "언제 · 어떤 문제로 · 뭘 틀렸나" 는 쌓인 기록이 있어야 나옵니다. */

/** 서버가 아는 문제 유형. attempts 표가 이것들만 받습니다 (마이그레이션 18) */
export type QuizType = 'meaning' | 'pinyin' | 'hanzi' | 'blank' | 'tone' | 'listen' | 'speak';

/**
 * 문제 하나를 푼 기록을 남깁니다.
 *
 * ★ 실패해도 던지지 않습니다. markWord 와 정반대입니다.
 *   진도는 못 저장하면 사용자가 알아야 하지만, 이건 통계용이라
 *   한 줄 빠졌다고 문제 풀이를 멈추면 안 됩니다.
 *   지하철에서 신호가 끊겼다고 다음 문제로 못 넘어가면 그게 더 나쁩니다.
 *
 * 그래서 이 함수는 기다리지 않고 불러도 됩니다.
 */
export async function logAttempt(
	wordId: string,
	quizType: QuizType,
	correct: boolean,
	answeredMs?: number | null,
	meta?: Record<string, unknown>,
): Promise<void> {
	try {
		const { error } = await supabase.rpc('log_attempt', {
			p_word_id: wordId,
			p_quiz_type: quizType,
			p_correct: correct,
			p_answered_ms: answeredMs ?? null,
			p_meta: meta ?? {},
		});
		// 조용히 넘어가되, 개발 중에는 콘솔에서 보이게 합니다.
		if (error) console.warn('푼 기록을 못 남겼습니다:', error.message);
	} catch (e) {
		console.warn('푼 기록을 못 남겼습니다:', e);
	}
}

/* ── 내 진도 숫자 ───────────────────────────────────────────
   오늘 얼마나 했는지 · 며칠 이어왔는지 · 오늘 복습할 게 몇 개인지.
   전부 저장은 하고 있었는데 화면에 안 나오던 것들입니다. */

export type Stats = {
	today_total: number;
	today_correct: number;
	streak_days: number;
	due_now: number;
	new_count: number;
	learning_count: number;
	known_count: number;
};

/**
 * 진도 숫자를 받아옵니다.
 *
 * 서버가 셉니다. '오늘' 과 '며칠 연속' 은 한국 시각으로 따져야 하는데
 * 브라우저마다 시계가 다를 수 있고, 푼 기록은 계속 쌓여서
 * 통째로 받아와 세면 쓸수록 느려집니다 (마이그레이션 20).
 */
export async function getStats(): Promise<Stats> {
	const { data, error } = await supabase.rpc('my_stats');
	if (error) throw new Error(`진도를 못 받았습니다: ${error.message}`);

	// 여러 줄을 돌려주는 모양이라 배열로 옵니다. 줄은 늘 하나입니다.
	const row = Array.isArray(data) ? data[0] : data;
	if (!row) throw new Error('진도를 못 받았습니다');
	return row as Stats;
}

/* ── 이상한 곳 알려주기 ─────────────────────────────────────
   한국어 뜻과 예문 973개는 새로 만든 것이고 사람이 아직 안 봤습니다.
   혼자 다 보는 건 사실상 불가능해서, 쓰는 사람이 눌러준 것부터 봅니다. */

/** 무엇이 이상한지. 서버(reports 표)가 이 넷만 받습니다 (마이그레이션 19) */
export type ReportKind = 'meaning' | 'example' | 'pinyin' | 'other';

export const REPORT_LABEL: Record<ReportKind, string> = {
	meaning: '한국어 뜻이 이상해요',
	example: '예문이 이상해요',
	pinyin: '병음이나 성조가 이상해요',
	other: '그 밖에 이상한 것',
};

/**
 * 이상한 곳을 알려줍니다.
 *
 * ★ logAttempt 와 달리 실패하면 던집니다.
 *   푼 기록은 통계용이라 한 줄 빠져도 되지만, 이건 사람이 일부러 누른 것입니다.
 *   안 갔는데 "접수됐습니다" 라고 하면 다시는 안 눌러줍니다.
 *
 * 같은 단어를 하루에 두 번 누르면 서버가 막고, 그 말이 그대로 화면에 뜹니다.
 */
export async function reportWord(
	wordId: string,
	kind: ReportKind,
	note?: string,
): Promise<void> {
	const { error } = await supabase.rpc('report_word', {
		p_word_id: wordId,
		p_kind: kind,
		p_note: note?.trim() || null,
	});
	if (error) throw new Error(error.message);
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

/**
 * 자료에 실제로 들어 있는 주제를 모읍니다.
 *
 * 주제 목록을 코드에 적어두지 않습니다. 자료에서 뽑습니다 —
 * 적어두면 CSV 를 고칠 때마다 두 곳을 맞춰야 하고, 한쪽만 고치면
 * 화면에 있는데 눌러도 아무것도 안 나오는 주제가 생깁니다.
 *
 * 단어가 많은 주제부터 보여줍니다.
 */
export function topicsOf(words: Word[]): { topic: string; count: number }[] {
	const tally = new Map<string, number>();
	for (const w of words) {
		if (!w.topic) continue;
		tally.set(w.topic, (tally.get(w.topic) ?? 0) + 1);
	}
	return [...tally.entries()]
		.map(([topic, count]) => ({ topic, count }))
		.sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic));
}

/**
 * 이 단어와 한자를 나눠 쓰는 다른 단어들.
 *
 * 한자는 뜻을 지고 다닙니다. 学(배우다)를 알면 学校·同学·学生이 한 덩어리로 묶입니다.
 * 낱개로 973번 외우는 것과 묶어서 보는 것은 힘이 다릅니다.
 *
 * ★ 한자가 같은 줄은 하나만 남깁니다.
 *   공식 목록에는 같은 한자가 두 번 나옵니다 (把 개사/양사, 背 bēi/bèi, 为 동사/개사).
 *   그걸 그대로 늘어놓으면 `为了` 아래에 **为 · 为** 가 나란히 뜹니다.
 *   실제로 그렇게 나왔습니다. 똑같은 글자가 두 번 보이면 고장으로 읽힙니다.
 *   여기는 "이 글자가 이렇게도 쓰인다" 를 보는 자리라 글자 하나면 충분하고,
 *   눌러 들어가면 품사까지 다 나옵니다.
 *
 * 자기 자신과 자기와 한자가 같은 줄도 뺍니다.
 *
 * 글자 하나짜리 단어(学)에서는 그 글자가 들어간 모든 단어가 걸려서 수십 개가 됩니다.
 * 그래서 개수를 끊고, 자주 쓰는 것부터 보여줍니다.
 */
export function sharingHanzi(word: Word, words: Word[], limit = 8): Word[] {
	const chars = [...word.hanzi].filter((ch) => /[一-鿿]/.test(ch));
	if (chars.length === 0) return [];

	const found = words
		.filter((w) => w.id !== word.id && w.hanzi !== word.hanzi)
		.filter((w) => chars.some((ch) => w.hanzi.includes(ch)))
		.sort((a, b) => (a.frequency ?? 9999) - (b.frequency ?? 9999));

	const seen = new Set<string>();
	const out: Word[] = [];
	for (const w of found) {
		if (seen.has(w.hanzi)) continue;
		seen.add(w.hanzi);
		out.push(w);
		if (out.length >= limit) break;
	}
	return out;
}

export function filterWords(
	words: Word[],
	{
		q,
		status,
		topic,
		progress,
	}: {
		q: string;
		status: 'all' | Status;
		/** null 이면 주제를 가리지 않습니다 */
		topic?: string | null;
		progress: Map<string, Progress>;
	},
): Word[] {
	const query = q.trim();
	const py = plain(query);

	return words.filter((w) => {
		if (status !== 'all') {
			const cur = progress.get(w.id)?.status ?? 'new';
			if (cur !== status) return false;
		}

		if (topic && w.topic !== topic) return false;

		if (!query) return true;

		return (
			w.hanzi.includes(query) ||
			w.meaning_ko.includes(query) ||
			(py.length > 0 && (w.pinyin_plain ?? '').includes(py))
		);
	});
}
