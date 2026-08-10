// 병음을 음절로 나누고, 음절의 성조를 갈아끼웁니다.
//
// 왜 필요한가:
//   성조 문제의 보기가 `ā á ǎ à a` 로 고정이면 "몇 성인지" 만 고르는 셈이라
//   그 단어를 읽는 연습이 안 됩니다. 被 문제라면 `bēi béi běi bèi bei` 여야 합니다.
//   그러려면 병음에서 **짚은 글자의 음절만** 떼어낼 수 있어야 합니다.
//
// ★ 이 파일은 아무것도 import 하지 않습니다 (pitch.ts 와 같은 모양).
//   화면도 없고 숫자와 글자만 있습니다. 그래야
//   scripts/check-pinyin.mjs 가 이 파일을 그대로 읽어서 973단어에 돌려볼 수 있습니다.
//   검사 스크립트가 규칙을 따로 베껴 쓰면 "검사는 통과하는데 화면은 다른 규칙" 이 됩니다.
//
// ★ 애매하면 null 을 돌려줍니다.
//   quiz.ts 의 tonesOf 와 같은 태도입니다. 틀린 음절을 보여주느니 안 보여주는 게 낫습니다.

/** 0 은 경성(가볍게 흘리는 소리)입니다 */
export type PinyinTone = 0 | 1 | 2 | 3 | 4;

/**
 * 성조 기호가 붙은 모음 → 기호를 뗀 모음.
 *
 * ü 를 u 로 만들면 안 됩니다. 绿茶(lǜchá)가 lùchá(路茶)로 되살아납니다.
 * ǜ 는 ü 로 돌아가야 합니다.
 */
const MARKED: Record<string, { base: string; tone: PinyinTone }> = {};
{
	// 늘어놓은 순서가 곧 1·2·3·4성입니다
	const rows: [string, string][] = [
		['a', 'āáǎà'],
		['e', 'ēéěè'],
		['i', 'īíǐì'],
		['o', 'ōóǒò'],
		['u', 'ūúǔù'],
		['ü', 'ǖǘǚǜ'],
	];
	for (const [base, marks] of rows) {
		[...marks].forEach((ch, i) => {
			MARKED[ch] = { base, tone: (i + 1) as PinyinTone };
			MARKED[ch.toUpperCase()] = { base: base.toUpperCase(), tone: (i + 1) as PinyinTone };
		});
	}
}

/** 기호를 뗀 모음 → 성조별 기호가 붙은 모음 */
const TO_MARK: Record<string, string> = {
	a: 'āáǎà',
	e: 'ēéěè',
	i: 'īíǐì',
	o: 'ōóǒò',
	u: 'ūúǔù',
	ü: 'ǖǘǚǜ',
};

/**
 * 표준 병음 음절 목록 (성조 기호를 뗀 것).
 *
 * 음절 경계가 병음에 적혀 있지 않아서(ānpái) 어디서 끊을지는 이 목록이 정합니다.
 * ü 는 ü 그대로 씁니다 — lu 와 lü 는 서로 다른 음절입니다.
 * ju·qu·xu 계열은 표기가 u 라서 u 로 적습니다 (규칙이 그렇습니다).
 */
const SYLLABLES = new Set<string>(
	(
		'a ai an ang ao e ei en eng er o ou ' +
		'yi ya yao ye you yan yin yang ying yong ' +
		'wu wa wo wai wei wan wen wang weng ' +
		'yu yue yuan yun ' +
		'ba bo bai bei bao ban ben bang beng bi bie biao bian bin bing bu ' +
		'pa po pai pei pao pou pan pen pang peng pi pie piao pian pin ping pu ' +
		'ma mo me mai mei mao mou man men mang meng mi mie miao miu mian min ming mu ' +
		'fa fo fei fou fan fen fang feng fu ' +
		'da de dai dei dao dou dan den dang deng di die diao diu dian ding dong du duo dui duan dun ' +
		'ta te tai tei tao tou tan tang teng ti tie tiao tian ting tong tu tuo tui tuan tun ' +
		'na ne nai nei nao nou nan nen nang neng ni nie niao niu nian nin niang ning nong ' +
		'nu nuo nuan nun nü nüe ' +
		'la lo le lai lei lao lou lan lang leng li lia lie liao liu lian lin liang ling long ' +
		'lu luo luan lun lü lüe ' +
		'ga ge gai gei gao gou gan gen gang geng gong gu gua guo guai gui guan gun guang ' +
		'ka ke kai kei kao kou kan ken kang keng kong ku kua kuo kuai kui kuan kun kuang ' +
		'ha he hai hei hao hou han hen hang heng hong hu hua huo huai hui huan hun huang ' +
		'ji jia jie jiao jiu jian jin jiang jing jiong ju jue juan jun ' +
		'qi qia qie qiao qiu qian qin qiang qing qiong qu que quan qun ' +
		'xi xia xie xiao xiu xian xin xiang xing xiong xu xue xuan xun ' +
		'zha zhe zhi zhai zhei zhao zhou zhan zhen zhang zheng zhong ' +
		'zhu zhua zhuo zhuai zhui zhuan zhun zhuang ' +
		'cha che chi chai chao chou chan chen chang cheng chong ' +
		'chu chua chuo chuai chui chuan chun chuang ' +
		'sha she shi shai shei shao shou shan shen shang sheng ' +
		'shu shua shuo shuai shui shuan shun shuang ' +
		're ri rao rou ran ren rang reng rong ru rua ruo rui ruan run ' +
		'za ze zi zai zei zao zou zan zen zang zeng zong zu zuo zui zuan zun ' +
		'ca ce ci cai cao cou can cen cang ceng cong cu cuo cui cuan cun ' +
		'sa se si sai sao sou san sen sang seng song su suo sui suan sun'
	).split(' '),
);

/** 儿화. 空儿(kòngr)처럼 앞 음절에 r 하나가 더 붙습니다. 맨 뒤에서만 음절로 봅니다 */
const ERHUA = 'r';

/** 음절 경계를 대놓고 적어둔 자리. 띄어쓰기와 격음부호(bǎo'ān) */
const SEPARATORS = new Set([' ', ' ', "'", '’', '-']);

/** 음절 하나. sep 은 이 음절 **앞**에 있던 구분 기호입니다(없으면 빈 글자) */
export type Syllable = {
	/** 성조 기호가 붙은 그대로. 원래 대소문자를 지킵니다 */
	text: string;
	/** 앞에 붙어 있던 구분 기호 */
	sep: string;
	/** 이 음절의 성조. 기호가 없으면 0(경성) */
	tone: PinyinTone;
};

/** 글자 하나를 성조와 알맹이로 가릅니다 */
function tear(ch: string): { base: string; tone: PinyinTone } {
	return MARKED[ch] ?? { base: ch, tone: 0 };
}

/**
 * 음절에서 성조 기호를 뗍니다.
 * 'bèi' → 'bei' · 'lǜ' → 'lü' (u 가 아닙니다)
 */
export function stripTone(syllable: string): string {
	return [...syllable].map((ch) => tear(ch).base).join('');
}

/** 음절의 성조. 기호가 없으면 0 */
export function toneOf(syllable: string): PinyinTone {
	for (const ch of syllable) {
		const t = tear(ch).tone;
		if (t !== 0) return t;
	}
	return 0;
}

/**
 * 성조 기호를 어느 모음에 붙일지 고릅니다. 붙일 자리가 없으면 -1.
 *
 * 표준 규칙:
 *   1. a 가 있으면 a 에
 *   2. 없으면 o 나 e 에 (둘은 한 음절에 같이 오지 않습니다)
 *   3. 그것도 없으면 **마지막 모음**에 — iu 는 u 에(liù), ui 는 i 에(duì)
 */
function markSpot(base: string): number {
	const chars = [...base];
	const lower = chars.map((c) => c.toLowerCase());

	const a = lower.indexOf('a');
	if (a !== -1) return a;

	const o = lower.indexOf('o');
	if (o !== -1) return o;

	const e = lower.indexOf('e');
	if (e !== -1) return e;

	for (let i = chars.length - 1; i >= 0; i--) {
		if (TO_MARK[lower[i]]) return i;
	}
	return -1;
}

/**
 * 음절의 성조를 갈아끼웁니다. 'bei' + 4 → 'bèi'
 *
 * 이미 붙어 있던 기호는 떼고 다시 붙입니다. 붙일 모음이 없으면(儿화의 r) null.
 * 大文字도 지킵니다 — 长城(Chángchéng)처럼 첫 글자가 대문자인 자료가 있습니다.
 */
export function withTone(syllable: string, tone: PinyinTone): string | null {
	const base = stripTone(syllable);
	if (tone === 0) return base;

	const at = markSpot(base);
	if (at === -1) return null;

	const chars = [...base];
	const vowel = chars[at];
	const marked = TO_MARK[vowel.toLowerCase()]?.[tone - 1];
	if (!marked) return null;

	chars[at] = vowel === vowel.toLowerCase() ? marked : marked.toUpperCase();
	return chars.join('');
}

/**
 * 성조 보기 5개. 1·2·3·4성과 경성 순서입니다.
 *
 * 만들 수 없으면 null 입니다 — 화면은 그때 예전처럼 `ā á ǎ à a` 로 돌아갑니다.
 */
export function toneVariants(syllable: string): { tone: PinyinTone; text: string }[] | null {
	const tones: PinyinTone[] = [1, 2, 3, 4, 0];
	const out: { tone: PinyinTone; text: string }[] = [];

	for (const tone of tones) {
		const text = withTone(syllable, tone);
		if (!text) return null;
		out.push({ tone, text });
	}

	// 두 보기가 같은 글자로 보이면 정답이 둘이 됩니다. 이 프로젝트가 세 번 겪은 사고입니다.
	const seen = new Set(out.map((v) => v.text));
	if (seen.size !== out.length) return null;

	return out;
}

/**
 * 구분 기호가 없는 한 덩어리를 음절로 나눕니다. 나올 수 있는 방법을 **전부** 돌려줍니다.
 *
 * 지키는 규칙 셋:
 *   1. 조각 하나하나가 표준 음절이어야 합니다 (맨 뒤의 r 은 儿화라 봐줍니다)
 *   2. 성조 기호는 한 음절에 하나뿐입니다. 두 개가 든 조각은 잘못 끊은 것입니다
 *   3. **첫 음절이 아니면 a·o·e 로 시작할 수 없습니다.**
 *      정서법이 그런 자리에는 격음부호를 넣게 되어 있습니다 (bǎo'ān · nǚ'ér).
 *      이 규칙 하나가 fángàn 을 fán|gàn 으로 못박아 줍니다.
 */
function waysToSplit(chunk: string): number[][] {
	const chars = [...chunk];
	const torn = chars.map(tear);
	const plain = torn.map((t) => t.base.toLowerCase()).join('');
	const out: number[][] = [];

	function walk(from: number, sizes: number[]) {
		if (out.length > 8) return; // 이만큼 갈리면 어차피 포기합니다
		if (from === chars.length) {
			out.push([...sizes]);
			return;
		}

		for (let len = 1; from + len <= chars.length; len++) {
			const piece = plain.slice(from, from + len);
			const last = from + len === chars.length;

			const known = SYLLABLES.has(piece) || (last && sizes.length > 0 && piece === ERHUA);
			if (!known) continue;

			// 성조 기호가 두 개 든 조각은 잘못 끊은 것입니다
			let marks = 0;
			for (let i = from; i < from + len; i++) if (torn[i].tone !== 0) marks++;
			if (marks > 1) continue;

			// 첫 음절이 아니면 a·o·e 로 시작할 수 없습니다
			if (sizes.length > 0 && 'aoe'.includes(piece[0])) continue;

			sizes.push(len);
			walk(from + len, sizes);
			sizes.pop();
		}
	}

	walk(0, []);
	return out;
}

/**
 * 병음을 음절 count 개로 나눕니다. 애매하거나 못 나누면 null.
 *
 * count 는 한자 글자 수입니다. 이걸 알려주는 게 핵심입니다 —
 * 先(xiān)은 'xian' 하나로도 'xi|an' 둘로도 끊을 수 있는데,
 * 글자가 하나라는 걸 알면 답이 하나로 정해집니다.
 *
 * 띄어쓰기(néng bu néng)와 격음부호(bǎo'ān)는 경계가 이미 적혀 있는 것이라
 * 먼저 덩어리로 가른 뒤 각각을 나눕니다. 그 기호는 sep 에 담아 그대로 돌려줍니다 —
 * 나눈 것을 도로 이어붙이면 원래 병음이 글자 하나 안 틀리고 나와야 합니다.
 */
export function splitPinyin(pinyin: string, count: number): Syllable[] | null {
	if (!pinyin || count < 1) return null;

	// 1. 구분 기호로 덩어리를 가릅니다. 기호는 뒤에 오는 덩어리의 sep 이 됩니다.
	const chunks: { text: string; sep: string }[] = [];
	let sep = '';
	let buf = '';
	for (const ch of pinyin) {
		if (SEPARATORS.has(ch)) {
			if (buf) {
				chunks.push({ text: buf, sep });
				buf = '';
				sep = '';
			}
			sep += ch;
			continue;
		}
		buf += ch;
	}
	if (buf) chunks.push({ text: buf, sep });
	if (chunks.length === 0 || chunks.length > count) return null;

	// 2. 덩어리마다 나올 수 있는 방법을 구합니다. 하나도 없으면 여기서 끝입니다.
	const ways = chunks.map((c) => waysToSplit(c.text));
	if (ways.some((w) => w.length === 0)) return null;

	// 3. 덩어리들을 합쳐 음절 수가 count 가 되는 조합을 찾습니다.
	//    조합이 둘 이상이면 어느 쪽이 맞는지 알 수 없습니다 — 포기합니다.
	const found: number[][][] = [];
	function combine(at: number, picked: number[][], total: number) {
		if (found.length > 1) return;
		if (total > count) return;
		if (at === chunks.length) {
			if (total === count) found.push([...picked]);
			return;
		}
		for (const way of ways[at]) {
			picked.push(way);
			combine(at + 1, picked, total + way.length);
			picked.pop();
		}
	}
	combine(0, [], 0);
	if (found.length !== 1) return null;

	// 4. 정한 대로 원래 글자를 잘라 담습니다.
	const out: Syllable[] = [];
	found[0].forEach((sizes, i) => {
		const chars = [...chunks[i].text];
		let from = 0;
		sizes.forEach((len, k) => {
			const text = chars.slice(from, from + len).join('');
			out.push({ text, sep: k === 0 ? chunks[i].sep : '', tone: toneOf(text) });
			from += len;
		});
	});

	return out;
}

/** 나눈 음절을 도로 이어붙입니다. 원래 병음과 글자 하나까지 같아야 합니다 */
export function joinPinyin(syllables: Syllable[]): string {
	return syllables.map((s) => s.sep + s.text).join('');
}
