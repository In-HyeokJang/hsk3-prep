// 데이터베이스에서 오는 모양. supabase/migrations/ 의 v_words 와 같습니다.

export type Word = {
	id: string; // 'L3-0001' 공식 목록 번호
	hanzi: string;
	pinyin: string;
	pinyin_plain: string | null; // 성조·띄어쓰기를 뗀 검색용
	pos: string | null; // 품사
	meaning_ko: string;
	hsk_level: number | null;
	topic: string | null;
	tags: string[] | null;
	frequency: number | null; // 작을수록 자주 쓰는 말
	audio_url: string | null;
	verified: boolean;
	example_zh: string | null;
	example_pinyin: string | null;
	example_ko: string | null;
};

/** 단어 하나에 대한 내 상태 */
export type Status = 'new' | 'unknown' | 'learning' | 'known';

export type Progress = {
	word_id: string;
	status: Status;
	seen_count: number;
	correct_count: number;
	wrong_count: number;
	/**
	 * 칸을 새로 만들지 않고 담아두는 자리.
	 *   streak  연속으로 몇 번 맞혔나 (복습 간격을 정할 때 씀)
	 *   star    즐겨찾기 별표
	 */
	meta?: { streak?: number; star?: boolean } | null;
};

/** 이 단어에 별표가 켜져 있나 */
export function isStarred(p: Progress | undefined): boolean {
	return p?.meta?.star === true;
}

export type Summary = {
	total: number;
	ready: number;
	verified: number;
	examples: number;
};

export const STATUS_LABEL: Record<Status, string> = {
	new: '처음',
	unknown: '모름',
	learning: '익히는 중',
	known: '외움',
};
