// 병음을 음절로 나누는 규칙이 973단어에 다 맞는지 검사합니다.
//
//   npm run check:pinyin
//
// 앞의 둘과 다릅니다.
//   db:check      "제대로 들어갔나"  — 줄 수 · 한자 깨짐 · 권한 · 함수
//   db:audit      "내용이 맞는가"    — 번체자 · 성조 없는 병음 · 빈 예문
//   check:pinyin  "규칙이 맞는가"    — 병음을 음절로 나눈 결과가 한자와 맞는가
//
// 왜 필요한가:
//   성조 문제의 보기를 `bēi béi běi bèi bei` 로 만들려면
//   병음에서 짚은 글자의 음절만 떼어낼 수 있어야 합니다.
//   그런데 병음에는 음절 경계가 안 적혀 있습니다 (ānpái).
//   규칙이 하나라도 어긋나면 화면에 엉뚱한 음절이 뜨는데,
//   973개를 눈으로 다 볼 수는 없습니다.
//
// ★ 데이터베이스가 필요 없습니다. data/ 의 CSV만 읽습니다.
//   .env.local 없이도 돌아갑니다.
//
// ★ 규칙을 여기에 베껴 쓰지 않습니다. web/lib/pinyin.ts 를 그대로 불러 씁니다.
//   베껴 쓰면 "검사는 통과하는데 화면은 다른 규칙" 이 됩니다.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { done, fail, parseCsv, ROOT, say } from './lib.mjs';

// 윈도우에서는 'c:\...' 를 그대로 import 할 수 없습니다. file:// 주소로 바꿔야 합니다.
const lib = (name) => pathToFileURL(path.join(ROOT, 'web/lib', name)).href;

const { splitPinyin, joinPinyin, stripTone, withTone, toneVariants } = await import(lib('pinyin.ts'));
const { canTone, tonesOf, pickSpeakDeck } = await import(lib('quiz.ts'));

/* ── 자료 읽기 ─────────────────────────────────────────────── */

const ONLY_HANZI = /^[一-鿿]+$/;

function readWords() {
	const dir = path.join(ROOT, 'data');
	const files = fs
		.readdirSync(dir)
		.filter((f) => f.startsWith('words-') && f.endsWith('.csv') && !f.includes('sample'));

	const byId = new Map();
	for (const file of files) {
		for (const row of parseCsv(fs.readFileSync(path.join(dir, file), 'utf8'))) {
			if (!row.hsk_id) continue;
			// 같은 단어가 여러 파일에 나오면 뒤엣것이 이깁니다 (db:seed 와 같은 규칙)
			byId.set(row.hsk_id, { id: row.hsk_id, hanzi: row.hanzi, pinyin: row.pinyin, ...row });
		}
	}
	return [...byId.values()];
}

/* ── 결과 모으기 ───────────────────────────────────────────── */

const problems = [];
const notes = [];

/** 검사 하나의 결과. bad 가 비어 있으면 통과입니다 */
function report(code, title, bad, total, { soft = false } = {}) {
	const line = `${bad.length === 0 ? '✓' : soft ? '·' : '✗'} ${code} ${title} — ${bad.length} / ${total}`;
	say(line);

	if (bad.length > 0) {
		for (const one of bad.slice(0, 8)) say(`      ${one}`);
		if (bad.length > 8) say(`      … 그 밖 ${bad.length - 8}개`);
		(soft ? notes : problems).push(`${code} ${title} — ${bad.length}개`);
	}
}

/* ── R. 규칙 자체 시험 ─────────────────────────────────────── */
//
// 자료에 없는 함정을 손으로 못박아 둡니다.
// 973단어가 다 통과해도 규칙이 맞다는 뜻은 아닙니다 —
// 지금 자료에 그 모양이 없어서 안 걸린 것일 수 있습니다.

const RULES = [
	// ü 는 u 가 아닙니다. 绿(lǜ)을 lù 로 만들면 路 가 됩니다
	['stripTone ǜ', () => stripTone('lǜ'), 'lü'],
	['withTone lü 4', () => withTone('lü', 4), 'lǜ'],
	['withTone nü 3', () => withTone('nü', 3), 'nǚ'],

	// 성조 기호 자리: a 우선 → o·e → 마지막 모음
	['withTone jiao 4', () => withTone('jiao', 4), 'jiào'],
	['withTone gou 3', () => withTone('gou', 3), 'gǒu'],
	['withTone xie 2', () => withTone('xie', 2), 'xié'],
	['withTone liu 4 (iu 는 뒤에)', () => withTone('liu', 4), 'liù'],
	['withTone dui 4 (ui 는 뒤에)', () => withTone('dui', 4), 'duì'],
	['withTone shui 3', () => withTone('shui', 3), 'shuǐ'],

	// 대문자를 지킵니다 (长城 Chángchéng · 联合国 Liánhéguó)
	['withTone An 1 (대문자)', () => withTone('An', 1), 'Ān'],
	['stripTone Chéng', () => stripTone('Chéng'), 'Cheng'],

	// 경성은 기호를 다 뗀 모양입니다
	['withTone bei 0', () => withTone('bei', 0), 'bei'],

	// 나누기: 격음부호가 없으면 a·o·e 로 시작하는 음절을 뒤에 둘 수 없습니다
	['bǎo\'ān 2음절', () => splitPinyin("bǎo'ān", 2)?.map((s) => s.text).join('|'), 'bǎo|ān'],
	['ānpái 2음절', () => splitPinyin('ānpái', 2)?.map((s) => s.text).join('|'), 'ān|pái'],
	['xiān 1음절', () => splitPinyin('xiān', 1)?.map((s) => s.text).join('|'), 'xiān'],
	['xiān 2음절은 못 나눔', () => splitPinyin('xiān', 2), null],
	['néng bu néng 3음절', () => splitPinyin('néng bu néng', 3)?.map((s) => s.text).join('|'), 'néng|bu|néng'],
	['띄어쓰기를 그대로 돌려줌', () => joinPinyin(splitPinyin('néng bu néng', 3)), 'néng bu néng'],
	['kòngr 儿화 2음절', () => splitPinyin('kòngr', 2)?.map((s) => s.text).join('|'), 'kòng|r'],
	['Zhōnghuá Mínzú 4음절', () => splitPinyin('Zhōnghuá Mínzú', 4)?.map((s) => s.text).join('|'), 'Zhōng|huá|Mín|zú'],

	// 보기 5개
	['toneVariants bèi', () => toneVariants('bèi')?.map((v) => v.text).join(' '), 'bēi béi běi bèi bei'],
	['toneVariants 儿화 r 은 못 만듦', () => toneVariants('r'), null],
];

say('── R. 규칙 자체 시험 ───────────────────────────');
const ruleFails = [];
for (const [name, run, want] of RULES) {
	let got;
	try {
		got = run();
	} catch (err) {
		got = `던짐: ${err.message}`;
	}
	if (got !== want) ruleFails.push(`${name} — ${JSON.stringify(want)} 여야 하는데 ${JSON.stringify(got)}`);
}
report('R', '규칙 시험', ruleFails, RULES.length);

/* ── 시작 ──────────────────────────────────────────────────── */

const words = readWords();
say(`\n자료 ${words.length}개를 읽었습니다.\n`);

const plain = words.filter((w) => ONLY_HANZI.test(w.hanzi)); //   한자만 (접사 제외)
const affix = words.filter((w) => !ONLY_HANZI.test(w.hanzi)); // 접사
const charCount = plain.reduce((sum, w) => sum + [...w.hanzi].length, 0);

say(`  한자만 ${plain.length}개 · 접사 ${affix.length}개 · 나와야 할 음절 ${charCount}개`);
say(`  접사: ${affix.map((w) => w.hanzi).join(' ')}\n`);

/* ── A. 음절 나누기 ────────────────────────────────────────── */

say('── A. 음절 나누기 ──────────────────────────────');

/** 나눈 결과를 담아둡니다. 아래 검사들이 다시 씁니다 */
const split = new Map();
for (const w of plain) {
	const got = splitPinyin(w.pinyin, [...w.hanzi].length);
	if (got) split.set(w.id, got);
}

report(
	'A1',
	'음절 수가 한자 수와 안 맞거나 못 나눈 단어',
	plain.filter((w) => !split.has(w.id)).map((w) => `${w.hanzi} ${w.pinyin} (${w.id})`),
	plain.length,
);

report(
	'A2',
	'도로 이어붙였을 때 원래 병음과 다른 단어',
	[...split.entries()]
		.filter(([id, s]) => joinPinyin(s) !== plain.find((w) => w.id === id).pinyin)
		.map(([id, s]) => {
			const w = plain.find((x) => x.id === id);
			return `${w.hanzi} ${w.pinyin} → ${joinPinyin(s)}`;
		}),
	split.size,
);

const allSyllables = [...split.values()].flat();

report(
	'A3',
	'성조 기호가 2개 이상 든 음절',
	allSyllables
		.filter((s) => [...s.text].filter((c) => 'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ'.includes(c)).length > 1)
		.map((s) => s.text),
	allSyllables.length,
);

say(`· A4 성조 기호가 없는 음절(경성) — ${allSyllables.filter((s) => s.tone === 0).length}개`);
report('A5', '접사가 검사 대상에 섞였는가', [], affix.length);

/* ── B. 성조 갈아끼우기 ────────────────────────────────────── */

say('\n── B. 성조 갈아끼우기 ──────────────────────────');

report(
	'B1',
	'성조를 뗐다 원래대로 붙였을 때 달라진 음절',
	allSyllables.filter((s) => withTone(s.text, s.tone) !== s.text).map((s) => `${s.text} → ${withTone(s.text, s.tone)}`),
	allSyllables.length,
);

report(
	'B2',
	'단어 단위 왕복 실패',
	[...split.entries()]
		.filter(([id, s]) => {
			const back = s.map((x) => x.sep + withTone(x.text, x.tone)).join('');
			return back !== plain.find((w) => w.id === id).pinyin;
		})
		.map(([id]) => plain.find((w) => w.id === id).pinyin),
	split.size,
);

// B3 은 pinyin_plain 을 DB에서 가져와야 하는데, 이 검사는 DB 없이 돕니다.
// 대신 같은 규칙을 여기서 다시 만들어 견줍니다 — 성조를 뗀 것에 성조 기호가 남으면 안 됩니다.
report(
	'B3',
	'성조를 뗐는데 기호가 남은 음절',
	allSyllables
		.filter((s) => /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(stripTone(s.text)))
		.map((s) => `${s.text} → ${stripTone(s.text)}`),
	allSyllables.length,
);

/**
 * 성조 기호가 표준 자리에 붙어 있는가.
 * a 우선 → o·e → 마지막 모음. 이 규칙으로 다시 붙여서 원래와 같으면 표준입니다.
 * (B1 이 대신 잡지만, 따로 세면 원인이 보입니다)
 */
report(
	'B4',
	'성조 기호가 표준 자리가 아닌 음절',
	allSyllables
		.filter((s) => s.tone !== 0 && withTone(stripTone(s.text), s.tone) !== s.text)
		.map((s) => s.text),
	allSyllables.length,
);

/* ── C. 성조 보기 5개 ──────────────────────────────────────── */

say('\n── C. 성조 보기 5개 ────────────────────────────');

/** 실제로 문제로 낼 수 있는 자리만 봅니다 (quiz.ts 의 canTone 과 같은 기준) */
const spots = [];
for (const w of plain) {
	if (!canTone(w)) continue;
	const s = split.get(w.id);
	if (!s) continue;
	const tones = tonesOf(w);
	for (let at = 0; at < s.length; at++) spots.push({ w, at, syllable: s[at], tone: tones[at] });
}

say(`  문제로 낼 수 있는 자리 ${spots.length}개 (canTone 통과 ${plain.filter(canTone).length}개)`);

const noVariants = [];
const clash = [];
const missing = [];
const notFive = [];
const differs = [];
let pairs = 0;

for (const spot of spots) {
	// ★ C1 은 toneVariants 가 아니라 withTone 으로 직접 만든 것을 봅니다.
	//   toneVariants 안에 "같은 글자가 있으면 null" 이라는 안전장치가 이미 있어서,
	//   그것으로 세면 C1 은 무슨 짓을 해도 0이 나옵니다.
	//   그건 늘 "없음" 만 말하는 검사라 없느니만 못합니다 (09-handoff.md 의 교훈).
	//   안전장치가 막아준 것과 애초에 겹치지 않는 것은 다릅니다.
	const raw = [1, 2, 3, 4, 0].map((t) => withTone(spot.syllable.text, t));
	for (let i = 0; i < raw.length; i++) {
		for (let k = i + 1; k < raw.length; k++) {
			pairs++;
			if (raw[i] !== null && raw[i] === raw[k]) clash.push(`${spot.w.hanzi} ${raw[i]}`);
		}
	}

	const vs = toneVariants(spot.syllable.text);
	if (!vs) {
		noVariants.push(`${spot.w.hanzi} ${spot.syllable.text}`);
		continue;
	}
	if (vs.length !== 5) notFive.push(`${spot.w.hanzi} ${spot.syllable.text}`);

	// 정답이 보기 안에 있는가
	if (!vs.some((v) => v.tone === spot.tone && v.text === spot.syllable.text)) {
		missing.push(`${spot.w.hanzi} ${spot.syllable.text} (${spot.tone}성)`);
	}

	// 성조만 갈아끼웠는가 — 자모가 달라지면 다른 글자를 보여주는 셈입니다
	const bare = stripTone(spot.syllable.text);
	for (const v of vs) if (stripTone(v.text) !== bare) differs.push(`${spot.syllable.text} → ${v.text}`);
}

// ★ tonesOf 와 splitPinyin 은 서로 다른 방식입니다.
//   tonesOf 는 성조 기호를 **순서대로 세고**, splitPinyin 은 **음절로 나눕니다**.
//   둘이 어긋나면 화면에서 밑줄 친 글자와 보기가 서로 다른 글자를 가리킵니다.
//   한쪽이 맞다고 다른 쪽이 맞는 게 아니라서 따로 세야 합니다.
report(
	'C6',
	'짚은 글자의 성조가 음절의 성조와 다른 자리',
	spots
		.filter((s) => s.syllable.tone !== s.tone)
		.map((s) => `${s.w.hanzi} ${s.w.pinyin} ${s.at}번째 — 기호 ${s.tone}성 / 음절 ${s.syllable.text} ${s.syllable.tone}성`),
	spots.length,
);

report('C0', '보기를 못 만든 자리', noVariants, spots.length);
report('C1', '같은 글자로 보이는 보기 쌍', clash, pairs);
report('C2', '정답이 보기 안에 없는 문제', missing, spots.length);
report('C3', '보기가 5개가 아닌 문제', notFive, spots.length);
report('C5', '원래 음절과 자모가 다른 보기', differs, spots.length * 5);

/* ── E. 회귀 ───────────────────────────────────────────────── */

say('\n── E. 회귀 (건드리면 안 되는 숫자) ─────────────');

const canToneCount = words.filter(canTone).length;
const speakDeck = pickSpeakDeck(words, 9999);
const byTone = [1, 2, 3, 4].map((t) => speakDeck.filter((q) => q.tone === t).length);

say(`  canTone 통과 ${canToneCount} / ${words.length}  (5회차 기록: 961 / 973)`);
say(`  pickSpeakDeck 대상 ${speakDeck.length}개 · 1성 ${byTone[0]} · 2성 ${byTone[1]} · 3성 ${byTone[2]} · 4성 ${byTone[3]}`);
say(`  (5회차 기록: 171개 · 34 · 44 · 38 · 55)`);

if (canToneCount !== 961) problems.push(`canTone 통과가 961에서 ${canToneCount}로 바뀌었습니다`);
if (speakDeck.length !== 171) problems.push(`pickSpeakDeck 대상이 171에서 ${speakDeck.length}로 바뀌었습니다`);

/* ── 끝 ────────────────────────────────────────────────────── */

say('');
if (notes.length > 0) {
	say('사람이 볼 것:');
	for (const n of notes) say(`  · ${n}`);
	say('');
}

if (problems.length > 0) {
	fail('고쳐야 할 것이 있습니다.', '', ...problems.map((p) => `· ${p}`));
}

done(
	'병음 규칙 검사 통과.',
	`단어 ${words.length}개 · 음절 ${allSyllables.length}개 · 성조 문제 자리 ${spots.length}개 · 보기 쌍 ${pairs}개`,
);
