// 자료를 기계로 훑어서 이상한 곳을 찾습니다.
//
//   npm run db:audit
//
// db:check 와 다릅니다.
//   db:check  "제대로 들어갔나"   — 줄 수 · 한자 깨짐 · 권한 · 함수
//   db:audit  "내용이 맞는가"     — 규칙 위반 · 앞뒤가 안 맞는 곳 · 사람이 봐야 할 곳
//
// 왜 필요한가:
//   한자·병음·품사는 공식 목록 그대로라 믿을 수 있지만,
//   한국어 뜻과 예문 973개는 새로 만든 것입니다.
//   973개를 눈으로 다 보는 건 사실상 불가능한데, 그중 상당수는
//   기계가 확실히 가려낼 수 있습니다. 사람은 남은 것만 보면 됩니다.
//
//   자료를 고칠 때마다 다시 돌리면, 고치다 새로 만든 어긋남도 그때 잡힙니다.
//
// ★ 이 스크립트는 아무것도 고치지 않습니다. 찾아서 보여주기만 합니다.

import { connect, done, loadEnv, say } from './lib.mjs';

loadEnv();

/* ── 검사에 쓰는 것들 ───────────────────────────────────────── */

const HANZI = /[一-鿿]/;
const TONE_MARK = /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;

/**
 * 자주 쓰이는 번체자.
 *
 * 이 프로젝트는 간체자만 씁니다 (CLAUDE.md). 번체가 섞이면
 * 자형이 어긋난 채로 외우게 되는데, 973개 중 한두 개는 눈으로 못 찾습니다.
 *
 * 온 세상 번체자를 다 담지는 않았습니다. 자주 쓰는 것만 있어도
 * 실수는 거의 다 걸립니다 — 실수는 흔한 글자에서 납니다.
 */
const TRADITIONAL = new Set(
	'學習國體會來時間們個對這樣說話發現實東車馬鳥語讀寫聽見長門問開關無為與從業樂觀點爲營衛書晝畫圖團園圓遠還邊過進運動員區醫廳廠廣閉閒陽陰際隨階雙變辯辦協單獨舊據處備複雜難雞鴨魚鮮麼麗歷曆麥黃齊龍龜齒黨賣買貴費資質賽贏輸較轉輕輪連遲選遞適達違遊',
);

/** 접사라서 예문에 글자 그대로는 안 나오는 줄 (괄호나 말줄임표가 들어 있음) */
const isAffix = (hanzi) => /[（(…]/.test(hanzi);

/* ── 검사 ──────────────────────────────────────────────────── */

/**
 * 검사 하나.
 *   name  화면에 뭐라고 쓸지
 *   why   왜 문제인지 (걸린 게 있을 때만 보여줍니다)
 *   find  걸린 줄들을 돌려줍니다
 *   soft  true 면 "사람이 봐야 할 곳" 입니다. 틀렸다는 뜻이 아닙니다
 */
const CHECKS = [
	{
		name: '번체자가 섞였는가',
		why: '이 프로젝트는 간체자만 씁니다. 섞이면 자형이 어긋난 채로 외우게 됩니다',
		find: (rows) =>
			rows
				.map((w) => {
					const bad = [
						...new Set(
							[...(w.hanzi + (w.example_zh ?? ''))].filter((c) => TRADITIONAL.has(c)),
						),
					];
					return bad.length ? { ...w, note: bad.join(' ') } : null;
				})
				.filter(Boolean),
	},
	{
		name: '병음에 성조 기호가 없는가',
		why: 'xuéxí 처럼 써야 합니다. xue2xi2 나 성조 없는 xuexi 는 안 됩니다',
		find: (rows) => rows.filter((w) => !TONE_MARK.test(w.pinyin)).map((w) => ({ ...w, note: w.pinyin })),
	},
	{
		name: '병음에 숫자가 들어갔는가',
		why: '성조를 숫자로 적은 흔적입니다 (xue2)',
		find: (rows) =>
			rows
				.filter((w) => /\d/.test(w.pinyin) || /\d/.test(w.example_pinyin ?? ''))
				.map((w) => ({ ...w, note: w.pinyin })),
	},
	{
		name: '중국어에 반각 문장부호가 섞였는가',
		why: '중국어는 ，。？！ 를 씁니다. 반각(,.?!)이 섞이면 CSV 칸이 밀릴 수도 있습니다',
		find: (rows) =>
			rows
				.filter((w) => /[,.?!;:]/.test(w.example_zh ?? ''))
				.map((w) => ({ ...w, note: w.example_zh })),
	},
	{
		name: '예문이 비었는가',
		why: '예문이 없으면 빈칸 문제를 낼 수 없고, 정답 화면도 허전합니다',
		find: (rows) => rows.filter((w) => !w.example_zh?.trim()),
	},
	{
		name: '예문의 병음이나 한국어가 비었는가',
		why: '예문만 있고 읽는 법이나 뜻이 없으면 초급자에게 아무 쓸모가 없습니다',
		find: (rows) =>
			rows
				.filter((w) => w.example_zh && (!w.example_pinyin?.trim() || !w.example_ko?.trim()))
				.map((w) => ({ ...w, note: !w.example_pinyin?.trim() ? '병음 없음' : '한국어 없음' })),
	},
	{
		name: '예문에 그 단어가 안 들어 있는가',
		why: '빈칸 문제를 낼 수 없습니다. 접사(初（初一）·…极了)는 원래 그래서 뺐습니다',
		find: (rows) =>
			rows.filter((w) => w.example_zh && !isAffix(w.hanzi) && !w.example_zh.includes(w.hanzi)),
	},
	{
		name: '한국어 뜻이 비었는가',
		why: '뜻이 없으면 문제를 낼 수도, 보기로 쓸 수도 없습니다',
		find: (rows) => rows.filter((w) => !w.meaning_ko?.trim()),
	},
	{
		name: '같은 예문을 여러 단어가 쓰는가',
		soft: true,
		why: '접사와 본딧말이 같은 예문을 쓰는 것은 정상입니다. 그 밖이면 한쪽을 바꾸는 편이 낫습니다',
		find: (rows) => {
			const bySentence = new Map();
			for (const w of rows) {
				if (!w.example_zh) continue;
				bySentence.set(w.example_zh, [...(bySentence.get(w.example_zh) ?? []), w]);
			}
			const out = [];
			for (const [sentence, group] of bySentence) {
				if (group.length < 2) continue;
				// 접사와 본딧말이 짝인 경우는 정상입니다 (者（志愿者） / 志愿者)
				if (group.some((w) => isAffix(w.hanzi))) continue;
				out.push({ ...group[0], note: `${group.map((w) => w.hanzi).join(' / ')} — ${sentence}` });
			}
			return out;
		},
	},
	{
		name: '예문이 3급치고 너무 긴가',
		soft: true,
		why: '한자 17자가 넘으면 초급자가 한 번에 읽기 어렵습니다',
		find: (rows) =>
			rows
				.map((w) => {
					const n = [...(w.example_zh ?? '')].filter((c) => HANZI.test(c)).length;
					return n > 16 ? { ...w, note: `한자 ${n}자` } : null;
				})
				.filter(Boolean),
	},
	{
		name: '한국어 뜻에 한자가 섞였는가',
		soft: true,
		why: '어법 설명이면 정상입니다 (不了 · 才 처럼). 그 밖이면 한국어로 풀어써야 합니다',
		find: (rows) =>
			rows.filter((w) => HANZI.test(w.meaning_ko ?? '')).map((w) => ({ ...w, note: w.meaning_ko })),
	},
];

/* ── 돌리기 ────────────────────────────────────────────────── */

const db = await connect();

const { rows } = await db.query(
	'select id, hanzi, pinyin, pos, meaning_ko, example_zh, example_pinyin, example_ko, verified from public.v_words order by id',
);

say(`\n자료 ${rows.length}개를 훑습니다.\n`);

let problems = 0;
let toLookAt = 0;

for (const check of CHECKS) {
	const hits = check.find(rows);
	const mark = hits.length === 0 ? '✓' : check.soft ? '·' : '✗';

	say(`${mark} ${check.name} — ${hits.length === 0 ? '없음' : `${hits.length}건`}`);

	if (hits.length === 0) continue;
	if (check.soft) toLookAt += hits.length;
	else problems += hits.length;

	say(`    ${check.why}`);
	for (const w of hits.slice(0, 10)) {
		say(`    ${w.id}  ${w.hanzi}  ${w.note ?? w.example_zh ?? ''}`);
	}
	if (hits.length > 10) say(`    … 그리고 ${hits.length - 10}건 더`);
	say('');
}

/* ── 사람이 봐야 하는 부분 ──────────────────────────────────── */

const { rows: verified } = await db.query(
	'select count(*) filter (where verified)::int done, count(*)::int total from public.words where hsk_level = 3',
);
const { rows: reports } = await db.query(
	`select r.word_id, w.hanzi, r.kind, r.note, r.created_at
     from public.reports r join public.words w on w.id = r.word_id
    where not r.handled order by r.created_at desc limit 10`,
);
const { rows: reportCount } = await db.query(
	'select count(*) filter (where not handled)::int open, count(*)::int total from public.reports',
);

say('─'.repeat(52));
say(`사람이 확인한 단어: ${verified[0].done} / ${verified[0].total}`);
say(`아직 안 본 신고: ${reportCount[0].open}건 (전체 ${reportCount[0].total}건)`);

if (reports.length > 0) {
	say('\n들어온 신고:');
	for (const r of reports) {
		say(`    ${r.word_id}  ${r.hanzi}  [${r.kind}]  ${r.note ?? ''}`);
	}
	say('\n고쳤으면 이렇게 표시합니다:');
	say("    update public.reports set handled = true, handled_at = now() where word_id = 'L3-0001';");
}

await db.end();

if (problems > 0) {
	say('');
	done(
		`고쳐야 할 것 ${problems}건, 사람이 볼 것 ${toLookAt}건.`,
		'',
		'자료를 고칠 때는 data/ 의 CSV 를 고치고 npm run db:seed 를 다시 돌립니다.',
		'SQL 을 새로 만들지 않습니다.',
	);
	process.exit(1);
}

say('');
done(
	`기계로 잡을 수 있는 문제는 없습니다. 사람이 볼 것 ${toLookAt}건.`,
	'',
	'뜻과 예문이 맞는지는 기계가 판단할 수 없습니다.',
	'사이트의 "이 단어가 이상해요" 로 들어온 신고부터 보시면 됩니다.',
	'',
	'확인을 마친 단어는 이렇게 표시합니다:',
	"    update public.words set verified = true, verified_at = now() where id in ('L3-0001');",
);
