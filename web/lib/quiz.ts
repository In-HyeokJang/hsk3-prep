// 학습 화면의 문제 규칙.
//
// 화면을 그리지 않고 "무슨 문제를 낼지" 와 "맞았는지" 만 정합니다.
// 화면과 떼어놔야 규칙만 따로 고칠 수 있습니다.

import type { Word } from './types';

/** 문제 형식 */
export type QuizKind =
	| 'type' //   한자를 보여주고 뜻을 직접 입력
	| 'pick-ko' // 한자를 보여주고 뜻 4개 중 고르기
	| 'pick-zh' // 뜻을 보여주고 한자 4개 중 고르기
	| 'pick-py' // 한자를 보여주고 병음 4개 중 고르기
	| 'blank'; //  예문에서 그 단어만 가리고 한자 4개 중 고르기

export type Quiz = {
	kind: QuizKind;
	word: Word;
	/** 4지선다일 때만. 정답 1개 + 오답 3개를 섞은 것 */
	choices: Word[];
};

/* ── 성조 ──────────────────────────────────────────────────
   성조는 학습(/study) 에 섞지 않고 따로 갑니다.
   뜻을 떠올리다가 갑자기 높낮이를 물으면 머리를 다른 데로 돌려야 하고,
   성조는 버튼 다섯 개로 빠르게 몰아 푸는 편이 연습이 됩니다. */

/** 0 은 경성(가볍게 흘리는 소리)입니다 */
export type Tone = 0 | 1 | 2 | 3 | 4;

/**
 * 성조 기호가 붙은 모음. 늘어놓은 순서가 곧 성조입니다.
 * 네 개씩 1·2·3·4성이 반복되므로 위치를 4로 나눈 나머지로 알아냅니다.
 */
const TONE_VOWELS = 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';

/** 한자만으로 이루어졌는지 (괄호나 말줄임표가 섞인 접사를 걸러냅니다) */
const ONLY_HANZI = /^[一-鿿]+$/;

/**
 * 글자마다 성조를 매깁니다. 낼 수 없는 단어면 null 입니다.
 *
 * 병음은 'ānpái' 처럼 붙여 쓰기 때문에 음절 경계가 적혀 있지 않습니다.
 * 대신 성조 기호는 음절마다 정확히 하나씩 붙으므로,
 * 기호의 개수가 한자 개수와 같으면 순서대로 짝지을 수 있습니다.
 *
 * ★ 애매하면 문제를 내지 않습니다.
 *   973단어를 직접 세어보니 929개가 딱 맞아떨어지고,
 *   기호가 하나 모자란 38개 중에는 마지막이 경성인 것(种子 zhǒngzi)만이 아니라
 *   儿화(空儿 kòngr)나 가운데가 경성인 것(能不能 néng bu néng)도 섞여 있었습니다.
 *   그래서 '두 글자이고 뒤가 儿이 아닐 때' 만 경성으로 봅니다. 나머지는 뺍니다.
 */
export function tonesOf(word: Word): Tone[] | null {
	const chars = [...word.hanzi];
	if (!ONLY_HANZI.test(word.hanzi)) return null;
	if (!word.pinyin) return null;

	const marks: Tone[] = [];
	for (const ch of word.pinyin) {
		const i = TONE_VOWELS.indexOf(ch);
		if (i !== -1) marks.push(((i % 4) + 1) as Tone);
	}

	if (marks.length === chars.length) return marks;
	if (marks.length === chars.length - 1 && chars.length === 2 && chars[1] !== '儿') {
		return [...marks, 0];
	}
	return null;
}

/** 성조 문제로 낼 수 있는 단어인지 */
export function canTone(word: Word): boolean {
	return tonesOf(word) !== null;
}

/** 성조 문제 하나. 어느 단어의 몇 번째 글자를 묻는지와 그 답입니다 */
export type ToneQuiz = { word: Word; at: number; tone: Tone };

/**
 * 성조 문제를 만듭니다. 낼 수 없는 단어면 null 입니다.
 *
 * 여러 글자면 그중 하나를 짚습니다. 화면에는 단어 전체가 보이므로
 * 背(bēi/bèi)처럼 읽는 법이 갈리는 글자도 답이 하나로 정해집니다.
 */
export function makeToneQuiz(word: Word): ToneQuiz | null {
	const tones = tonesOf(word);
	if (!tones) return null;

	const at = Math.floor(Math.random() * tones.length);
	return { word, at, tone: tones[at] };
}

/**
 * 성조 문제를 낼 묶음을 고릅니다.
 *
 * 다시 볼 때가 된 것부터 고르지 않습니다. 그건 뜻을 외우는 일정이고,
 * 성조는 뜻을 이미 외운 단어에서도 계속 틀리기 때문입니다.
 *
 * 대신 한 번이라도 본 단어를 앞세웁니다.
 * 처음 보는 단어의 높낮이를 묻는 건 연습이 아니라 찍기입니다.
 * 그것만으로 모자라면 자주 쓰는 말부터 채웁니다 (pool 이 이미 빈도순입니다).
 */
export function pickToneDeck(
	pool: Word[],
	howMany: number,
	seen: (id: string) => boolean,
): ToneQuiz[] {
	const able = pool.filter(canTone);
	const met = shuffle(able.filter((w) => seen(w.id)));
	const fresh = shuffle(able.filter((w) => !seen(w.id)).slice(0, 200));

	return [...met, ...fresh]
		.slice(0, howMany)
		.map(makeToneQuiz)
		.filter((q): q is ToneQuiz => q !== null);
}

/**
 * 소리 내어 연습할 묶음을 고릅니다 (성조 화면의 '말해보기').
 *
 * ★ 한 글자 단어만 씁니다.
 *   두 글자 단어를 주고 "두 번째 글자의 성조를 내보세요" 라고 하면,
 *   앞 글자를 같이 읽을지 말지부터 헷갈립니다. 재는 쪽도 마찬가지고요 —
 *   두 음절이 들어온 곡선에서 뒷음절만 떼어내는 건 다른 차원의 일입니다.
 *   한 글자면 들은 것 전부가 답입니다.
 *
 * 경성도 뺍니다. 높낮이가 아니라 앞 글자에 딸려 정해져서, 혼자 내보라고 할 수가 없습니다.
 */
export function pickSpeakDeck(pool: Word[], howMany: number): ToneQuiz[] {
	const able: ToneQuiz[] = [];

	for (const word of pool) {
		if ([...word.hanzi].length !== 1) continue;
		const tones = tonesOf(word);
		if (!tones || tones[0] === 0) continue;
		able.push({ word, at: 0, tone: tones[0] });
	}

	return shuffle(able).slice(0, howMany);
}

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

/** 빈칸을 대신할 표시. 반각 밑줄은 한자 사이에서 너무 얇아 보입니다. */
const BLANK = '＿＿＿';

/**
 * 빈칸 문제로 낼 수 있는 단어인지.
 *
 * 예문 안에 그 한자가 그대로 들어 있어야 가릴 자리가 생깁니다.
 * 자료에는 단어가 예문에 안 나오는 줄도 있어서(품사 설명·접사 등)
 * 확인하지 않으면 가릴 곳이 없는 문제가 만들어집니다.
 */
export function canBlank(word: Word): boolean {
	return !!word.example_zh && !!word.hanzi && word.example_zh.includes(word.hanzi);
}

/**
 * 예문에서 그 단어를 가린 문장을 만듭니다.
 *
 * 예문에 두 번 나오면 두 곳 다 가립니다. 한 곳만 가리면 남은 쪽이 답을 알려줍니다.
 */
export function blankSentence(word: Word): string {
	if (!word.example_zh) return '';
	return word.example_zh.split(word.hanzi).join(BLANK);
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
 * 뜻에서 괄호 안 설명을 떼어낸 알맹이.
 *
 * 자료의 뜻은 '자루 (손잡이 있는 물건을 세는 말)' 처럼
 * 짧은 우리말 뒤에 괄호로 설명을 답니다.
 * 괄호까지 통째로 견주면 설명이 다르다는 이유로 서로 다른 뜻이 되는데,
 * 화면에서 고를 때는 그 짧은 앞부분이 곧 답으로 보입니다.
 *
 * 실제로 把(자루 · 손잡이 있는 물건) 문제에 支(자루 · 가늘고 긴 것)가
 * 보기로 나와서 정답이 둘이 된 적이 있습니다. 1번(기록)을 켠 첫날 잡혔습니다.
 *
 * 괄호가 앞에 오는 것('(나쁜) 결과')도 있어서 앞부분을 자르지 않고
 * 괄호 묶음만 지웁니다. 다 지워서 아무것도 안 남으면 원래 것을 씁니다.
 */
function core(part: string): string {
	const stripped = part.replace(/[(（][^)）]*[)）]/g, '');
	return normalize(stripped) || normalize(part);
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

	const partsA = meaningParts(a.meaning_ko).map(core).filter(Boolean);
	const partsB = meaningParts(b.meaning_ko).map(core).filter(Boolean);
	return partsA.some((x) => partsB.some((y) => samePart(x, y)));
}

/* ── 병음 고르기 ──────────────────────────────────────────
   "뜻은 아는데 못 읽는" 상태를 잡는 문제입니다.

   ★ 여기서는 뜻이 겹치는지를 보면 안 됩니다. 병음이 겹치는지를 봐야 합니다.
     화면에 답으로 나오는 것이 병음이라서, 뜻이 아무리 달라도
     읽는 소리가 같으면 보기 두 개가 똑같은 글자로 보입니다.
     중국어에는 그런 짝이 아주 많습니다 (是/事 shì · 在/再 zài · 他/她 tā).
     3회차에 67군데 터졌던 사고와 같은 종류입니다. */

/** 병음 두 개가 화면에서 같은 글자로 보이는지 */
function samePinyin(a: string, b: string): boolean {
	const tidy = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
	return tidy(a) === tidy(b);
}

/**
 * 병음 문제로 낼 수 있는 단어인지.
 * 병음이 적혀 있기만 하면 됩니다.
 */
export function canPinyin(word: Word): boolean {
	return !!word.hanzi && !!word.pinyin.trim();
}

/**
 * 병음 문제의 오답 3개를 고릅니다.
 *
 * 글자 수가 같은 단어를 먼저 씁니다. 한 글자짜리 문제에 세 글자 병음이 섞이면
 * 읽을 줄 몰라도 길이만 보고 맞힐 수 있어서 연습이 안 됩니다.
 *
 * 정답과 견주는 것만으로는 모자랍니다. 이미 고른 오답과도 견줍니다.
 */
function pickWrongPinyin(word: Word, pool: Word[], howMany: number): Word[] {
	const usable = pool.filter(
		(w) =>
			w.id !== word.id &&
			canPinyin(w) &&
			!samePinyin(w.pinyin, word.pinyin) &&
			// ★ 한자가 같은 단어도 뺍니다. 병음만 견주면 이게 안 걸립니다.
			//   공식 목록에 한자가 같은 단어가 여섯 쌍 있는데,
			//   그중 셋은 병음이 **다릅니다** — 背(bēi/bèi) · 调(diào/tiáo) · 精神(jīngshén/jīngshen).
			//   화면에는 한자만 나오므로, 背 문제의 보기에 bēi 와 bèi 가 같이 뜨면
			//   둘 다 背 의 옳은 읽기라 정답이 둘이 됩니다.
			//   48,650문제를 만들어보니 실제로 1건 나왔습니다.
			w.hanzi !== word.hanzi,
	);

	const picked: Word[] = [];
	const takeFrom = (list: Word[]) => {
		for (const candidate of shuffle(list)) {
			if (picked.length >= howMany) return;
			// 정답과 견주는 것만으로는 모자랍니다. 이미 고른 오답끼리도 봐야 합니다 —
			// 병음도, 한자도. 任 문제의 오답으로 背(bēi)와 背(bèi)가 같이 뽑힌 적이 있습니다.
			if (picked.some((already) => samePinyin(already.pinyin, candidate.pinyin))) continue;
			if (picked.some((already) => already.hanzi === candidate.hanzi)) continue;
			picked.push(candidate);
		}
	};

	// 1순위: 글자 수가 같은 단어
	const size = [...word.hanzi].length;
	takeFrom(usable.filter((w) => [...w.hanzi].length === size));

	// 못 채웠으면 길이를 가리지 않고 채웁니다
	if (picked.length < howMany) {
		const taken = new Set(picked.map((w) => w.id));
		takeFrom(usable.filter((w) => !taken.has(w.id)));
	}
	return picked;
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
 * · 네 문제에 한 번은 병음 고르기
 * · 세 문제에 한 번은 빈칸 채우기 (예문에 그 한자가 들어 있을 때만)
 * · 뜻이 짧고 하나면 → 입력
 * · 그 밖에는 4지선다. 방향(한자→뜻 / 뜻→한자)은 번갈아 갑니다.
 *
 * 10문제 한 묶음이면 병음 3개(2·6·10번째) · 빈칸 2개(3·9번째) · 뜻 5개가 됩니다.
 * 두 규칙이 겹치는 자리(6번째)는 위에 적힌 병음이 이깁니다.
 *
 * 성조는 여기 없습니다. /tone 에서 따로 풉니다.
 * 오답을 3개 못 채우면 4지선다를 낼 수 없으니 원래 방식으로 돌립니다.
 */
export function makeQuiz(word: Word, pool: Word[], index: number): Quiz {
	if (index % 4 === 1 && canPinyin(word)) {
		const wrong = pickWrongPinyin(word, pool, 3);
		if (wrong.length === 3) {
			return { kind: 'pick-py', word, choices: shuffle([word, ...wrong]) };
		}
	}

	// 빈칸 문제를 봅니다. 조건이 안 맞으면 아래 원래 규칙으로 내려갑니다.
	if (index % 3 === 2 && canBlank(word)) {
		// 이미 예문에 보이는 한자는 오답에서 뺍니다.
		// 문장 안에 그대로 있는 글자가 보기에 나오면 답이 아닌 게 뻔히 보입니다.
		const sentence = word.example_zh ?? '';
		const usable = pool.filter((w) => w.id === word.id || !sentence.includes(w.hanzi));

		const wrong = pickWrong(word, usable, 3);
		if (wrong.length === 3) {
			return { kind: 'blank', word, choices: shuffle([word, ...wrong]) };
		}
	}

	if (isTypable(word)) return { kind: 'type', word, choices: [] };

	const wrong = pickWrong(word, pool, 3);
	if (wrong.length < 3) return { kind: 'type', word, choices: [] };

	return {
		kind: index % 2 === 0 ? 'pick-ko' : 'pick-zh',
		word,
		choices: shuffle([word, ...wrong]),
	};
}

/* ── ③ 받아쓰기 타임(듣기) 전용 ───────────────────────────
   듣기 게임은 `makeQuiz` 를 그대로 쓸 수가 없습니다.

   `makeQuiz` 는 **뜻이 짧고 하나인 단어를 입력 문제로 먼저 낚아챕니다**
   (isTypable). 그런데 그게 곧 **제일 쉬운 단어**입니다. 듣기 게임은
   '뜻 → 한자 4개' 만 주워 담으므로, 쉬운 것이 전부 빠져나가고
   어려운 것만 남았습니다.

   973단어로 세어보니 **393개(40.4%)가 그렇게 버려지고, 남은 문제 중
   쉬운 단어는 0개**였습니다. 城市(도시) · 报(신문) · 步(걸음) 처럼
   초급 모임에서 제일 먼저 들려줘야 할 것들이 통째로 사라졌습니다.

   ★ 오답 고르는 규칙은 그대로 물려받습니다.
     `pickWrong` 을 부르므로 한자 겹침 · 뜻 겹침(정답이 둘) 방어가
     `/study` 와 똑같이 걸립니다. 4지선다를 새로 짜지 않습니다. */

/**
 * 소리로 낼 수 있는 단어인지.
 *
 * 한자만으로 된 것만 씁니다. 공식 목록에는 접사가 여섯 개 섞여 있는데
 * (`初（初一）` · `…极了` · `者（志愿者）` …), 이걸 그대로 읽어주면
 * **괄호 안의 예시까지 같이 읽어서 답을 두 번 말해줍니다.**
 * `…极了` 처럼 말줄임표가 앞에 붙은 것은 아예 말이 안 됩니다.
 */
export function canListen(word: Word): boolean {
	return ONLY_HANZI.test(word.hanzi) && !!word.meaning_ko;
}

/**
 * 뜻을 보여주고 한자 4개 중 고르는 문제를 만듭니다.
 * 오답 3개를 못 채우면 null 입니다.
 *
 * `makeQuiz` 와 달리 **다른 형식으로 내려가지 않습니다.**
 * 부르는 쪽이 이 형식만 필요할 때 씁니다.
 */
export function makePickZh(word: Word, pool: Word[]): Quiz | null {
	const wrong = pickWrong(word, pool, 3);
	if (wrong.length < 3) return null;
	return { kind: 'pick-zh', word, choices: shuffle([word, ...wrong]) };
}

/* ── ④ 설명하기 전용 ──────────────────────────────────────
   한국어로 설명해서 맞히게 하는 게임입니다. 그런데 **그 뜻을 그대로
   말하는 것이 금지**입니다. 그래서 낼 수 없는 단어가 있습니다. */

/** 가리키는 것이 있는 낱말의 품사. 나머지는 문장을 엮는 말입니다 */
const REAL_WORD_POS = ['명사', '동사', '형용사'];

/**
 * 설명해서 맞히게 할 수 있는 단어인지.
 *
 * ★ 어법어(문법을 만드는 말)는 낼 수가 없습니다.
 *   `把`(~을) · `被`(~에 의해) · `了` · `为` 를 60초 안에 한국어로 설명하되
 *   그 뜻은 말하면 안 된다 — 성립하지 않습니다. 가리키는 물건도 동작도
 *   없어서 몸짓으로도 못 하고, 한자 가족을 띄워줘도 도움이 안 됩니다.
 *   초급자가 아니라 **중국어 선생님이라도** 60초 안에는 못 합니다.
 *
 * 두 가지로 거릅니다.
 *   ① **품사** — 명사·동사·형용사를 하나도 안 가진 것은 뺍니다
 *      (개사 · 접속사 · 접사 · 의성어 · 순수 부사 · 양사만인 것).
 *   ② **뜻에 `~` 가 있는 것** — 뜻 자체가 `~에 따라` 처럼 어법 설명으로
 *      적힌 것입니다. 품사가 동사여도 `了`(다 ~할 수 있다)는 여기서 걸립니다.
 *
 * 973단어로 세어보니 **132개(13.6%)** 가 걸러지고 **841개**가 남습니다.
 * 회차마다 127~149개라 60초짜리 게임에는 넉넉합니다.
 *
 * ⚠ 조금 억울하게 걸리는 것도 있습니다 — `各位`(여러분) · `哈哈`(웃음소리)는
 *   설명할 수 있는데 품사 때문에 빠집니다. 두어 개 손해 보더라도
 *   **못 낼 문제가 섞이는 쪽이 훨씬 나쁩니다.** 60초 중 20초가 날아갑니다.
 */
export function canExplain(word: Word): boolean {
	if (!ONLY_HANZI.test(word.hanzi)) return false;
	if (!word.meaning_ko) return false;
	if (word.meaning_ko.includes('~')) return false;
	return REAL_WORD_POS.some((p) => (word.pos ?? '').includes(p));
}
