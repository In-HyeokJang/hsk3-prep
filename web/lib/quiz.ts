// 학습 화면의 문제 규칙.
//
// 화면을 그리지 않고 "무슨 문제를 낼지" 와 "맞았는지" 만 정합니다.
// 화면과 떼어놔야 규칙만 따로 고칠 수 있습니다.

import type { Word } from './types';

/** 문제 형식 */
export type QuizKind =
	| 'type' //   한자를 보여주고 뜻을 직접 입력
	| 'pick-ko' // 한자를 보여주고 뜻 4개 중 고르기
	| 'pick-zh'; // 뜻을 보여주고 한자 4개 중 고르기

export type Quiz = {
	kind: QuizKind;
	word: Word;
	/** 4지선다일 때만. 정답 1개 + 오답 3개를 섞은 것 */
	choices: Word[];
};

/**
 * 뜻을 조각으로 나눕니다.
 * 자료의 뜻은 '안배하다 · 계획하다' 처럼 가운뎃점으로 여러 개를 붙여 씁니다.
 */
export function meaningParts(meaning: string): string[] {
	return meaning
		.split(/[·,]/)
		.map((s) => s.trim())
		.filter(Boolean);
}

/**
 * 입력으로 낼 수 있는 단어인지.
 *
 * 뜻이 하나이고 짧을 때만 입력으로 냅니다.
 * '~에 따라 · ~대로' 같은 걸 입력으로 내면 정답과 똑같이 칠 수가 없습니다.
 */
export function isTypable(word: Word): boolean {
	const parts = meaningParts(word.meaning_ko);
	if (parts.length !== 1) return false;

	const only = parts[0];
	if (only.includes('~')) return false; // 어법 설명은 칠 수가 없습니다
	if (only.includes('(')) return false; // '(나쁜) 결과' 같은 것
	return only.length <= 8;
}

/** 채점할 때 무시할 것들을 떼어냅니다 */
function normalize(s: string): string {
	return s
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '') //   띄어쓰기
		.replace(/[.,·()]/g, ''); // 문장부호
}

/**
 * 정리한 뜻 조각 두 개가 같은 말인지.
 *
 * '수영하다' 와 '수영' 을 같은 말로 봅니다.
 * 채점과 보기 고르기가 같은 기준을 써야, 채점이 맞다고 할 답이
 * 오답 보기에 섞이는 일이 없습니다.
 */
function samePart(a: string, b: string): boolean {
	if (a === b) return true;
	if (a.endsWith('하다') && b === a.slice(0, -2)) return true;
	if (b.endsWith('하다') && a === b.slice(0, -2)) return true;
	return false;
}

/**
 * 입력한 답이 맞는지.
 *
 * 너그럽게 봅니다. 뜻 조각 중 하나만 맞아도 정답이고,
 * '수영하다' 의 정답에 '수영' 이라고 써도 맞다고 합니다.
 * 시험이 아니라 스스로 확인하는 자리라서요.
 */
export function checkTyped(input: string, meaning: string): boolean {
	const got = normalize(input);
	if (!got) return false;

	for (const part of meaningParts(meaning)) {
		const want = normalize(part);
		if (!want) continue;
		if (samePart(got, want)) return true;
	}
	return false;
}

/**
 * 두 단어를 같은 문제에 넣으면 안 되는지.
 *
 * 공식 목록에는 한자가 같은 단어가 두 번 나오고(把 · 背 · 调),
 * 뜻이 겹치는 쌍도 백 개가 넘습니다(开展/展开, 情况/状况 …).
 * 이런 둘이 한 문제에 같이 나오면 정답이 두 개가 됩니다.
 */
function clashes(a: Word, b: Word): boolean {
	if (a.hanzi === b.hanzi) return true;

	const partsA = meaningParts(a.meaning_ko).map(normalize).filter(Boolean);
	const partsB = meaningParts(b.meaning_ko).map(normalize).filter(Boolean);
	return partsA.some((x) => partsB.some((y) => samePart(x, y)));
}

/** 배열을 섞습니다 */
function shuffle<T>(list: T[]): T[] {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/**
 * 오답 3개를 고릅니다.
 *
 * 같은 품사를 먼저 씁니다. '먹다' 문제에 '학교' 가 섞이면
 * 뜻을 몰라도 소거법으로 맞힐 수 있어서 연습이 안 됩니다.
 *
 * 정답과 겹치는지만이 아니라 이미 고른 오답과도 견줍니다.
 * 오답끼리 비교하지 않으면 보기 네 개 중 둘이 같은 말이 됩니다.
 */
function pickWrong(word: Word, pool: Word[], howMany: number): Word[] {
	const usable = pool.filter((w) => w.id !== word.id && w.meaning_ko && !clashes(w, word));

	const picked: Word[] = [];
	const takeFrom = (list: Word[]) => {
		for (const candidate of shuffle(list)) {
			if (picked.length >= howMany) return;
			if (picked.some((already) => clashes(already, candidate))) continue;
			picked.push(candidate);
		}
	};

	// 1순위: 품사가 같은 단어
	if (word.pos) takeFrom(usable.filter((w) => w.pos === word.pos));

	// 못 채웠으면 품사를 가리지 않고 채웁니다
	if (picked.length < howMany) {
		const taken = new Set(picked.map((w) => w.id));
		takeFrom(usable.filter((w) => !taken.has(w.id)));
	}
	return picked;
}

/**
 * 카드 하나를 문제로 바꿉니다.
 *
 * · 뜻이 짧고 하나면 → 입력
 * · 그 밖에는 4지선다. 방향(한자→뜻 / 뜻→한자)은 번갈아 갑니다.
 *
 * 오답을 3개 못 채우면 4지선다를 낼 수 없으니 입력으로 돌립니다.
 */
export function makeQuiz(word: Word, pool: Word[], index: number): Quiz {
	if (isTypable(word)) return { kind: 'type', word, choices: [] };

	const wrong = pickWrong(word, pool, 3);
	if (wrong.length < 3) return { kind: 'type', word, choices: [] };

	return {
		kind: index % 2 === 0 ? 'pick-ko' : 'pick-zh',
		word,
		choices: shuffle([word, ...wrong]),
	};
}
