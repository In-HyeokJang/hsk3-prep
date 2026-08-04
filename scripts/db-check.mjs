// 제대로 들어갔는지 확인합니다. 아무것도 고치지 않습니다.
//
//   npm run db:check
//
// "SQL 돌렸으니 됐겠지" 하고 넘어가면 4회차에 원인을 못 찾습니다.
// 특히 한자 깨짐은 화면을 만들기 전에 잡아야 합니다.

import { loadEnv, connect, say, done, fail } from './lib.mjs';

loadEnv();

const client = await connect();
const problems = [];

try {
	// ── 1. 표와 보기가 다 있나 ────────────────────────────────
	const { rows: objs } = await client.query(`
		select
		  to_regclass('public.words')      as words,
		  to_regclass('public.examples')   as examples,
		  to_regclass('public.progress')   as progress,
		  to_regclass('public.attempts')   as attempts,
		  to_regclass('public.v_words')    as v_words
	`);

	say('표와 보기');
	for (const [name, val] of Object.entries(objs[0])) {
		const ok = val !== null;
		say(`  ${ok ? '○' : '✗'} ${name}`);
		if (!ok) problems.push(`${name} 이 없습니다. npm run db:push 를 먼저 실행하세요.`);
	}

	if (problems.length) throw new Error('표가 준비되지 않았습니다');

	// ── 2. 자료가 얼마나 준비됐나 ─────────────────────────────
	const { rows: counts } = await client.query(`
		select
		  (select count(*) from public.words)                                as words,
		  (select count(*) from public.words where meaning_ko is not null)   as ready,
		  (select count(*) from public.examples)                             as examples,
		  (select count(*) from public.v_words where example_zh is not null) as with_example,
		  (select count(*) from public.words where verified)                 as verified,
		  (select count(*) from public.words where frequency is not null)    as with_freq,
		  (select count(*) from public.progress)                             as progress
	`);
	const c = counts[0];
	const bar = (n, total) => {
		const w = Math.round((Number(n) / Number(total)) * 30);
		return '█'.repeat(w) + '░'.repeat(30 - w);
	};

	say('\n자료 준비 상태');
	say(`  전체 단어       ${c.words}`);
	say(`  한국어 뜻 있음  ${String(c.ready).padStart(3)}  ${bar(c.ready, c.words)}  ← 화면에 나오는 것`);
	say(`  예문 있음       ${String(c.with_example).padStart(3)}  ${bar(c.with_example, c.words)}`);
	say(`  검수 끝         ${String(c.verified).padStart(3)}  ${bar(c.verified, c.words)}`);
	say(`  빈도 순위 있음  ${c.with_freq}`);
	say(`  내 진도         ${c.progress}`);

	if (Number(c.words) === 0) problems.push('단어가 하나도 없습니다. npm run db:seed 를 실행하세요.');
	if (Number(c.ready) === 0) problems.push('한국어 뜻이 있는 단어가 하나도 없습니다. 화면에 아무것도 안 나옵니다.');
	if (Number(c.with_example) < Number(c.ready)) {
		problems.push(
			`뜻은 있는데 예문이 없는 단어가 ${Number(c.ready) - Number(c.with_example)}개 있습니다. (치명적이진 않습니다)`,
		);
	}

	// ── 3. 한자·병음이 깨지지 않았나 ← 제일 중요 ──────────────
	const { rows: broken } = await client.query(`
		select id, hanzi, pinyin
		from public.words
		where hanzi ~ '[?]' or hanzi !~ '[\\u4e00-\\u9fff]'
		limit 5
	`);

	say('\n글자 확인');
	if (broken.length) {
		say('  ✗ 한자가 깨진 줄이 있습니다');
		for (const r of broken) say(`      ${r.id}  "${r.hanzi}"`);
		problems.push('한자가 깨졌습니다. CSV 인코딩을 확인하고 표를 지운 뒤 다시 넣어야 합니다.');
	} else {
		say('  ○ 한자 정상');
	}

	// 성조 기호가 살아 있는지
	const { rows: tone } = await client.query(`
		select count(*) as n from public.words
		where pinyin ~ '[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]'
	`);
	if (Number(tone[0].n) === 0 && Number(c.words) > 0) {
		say('  ✗ 병음에 성조 기호가 하나도 없습니다');
		problems.push('성조 기호가 사라졌습니다. 인코딩 문제일 가능성이 큽니다.');
	} else {
		say(`  ○ 성조 기호 살아 있음 (${tone[0].n}개)`);
	}

	// 자동 생성 칸이 채워졌는지 (영문자·숫자만 남아야 정상)
	const { rows: plain } = await client.query(`
		select
		  count(*) filter (where pinyin_plain is null or pinyin_plain = '') as empty,
		  count(*) filter (where pinyin_plain ~ '[^a-z0-9]')                as dirty
		from public.words
	`);
	if (Number(plain[0].empty) > 0 || Number(plain[0].dirty) > 0) {
		say(`  ✗ 검색용 병음이 이상합니다 (빈 값 ${plain[0].empty}개 · 기호 남음 ${plain[0].dirty}개)`);
		problems.push(`pinyin_plain 이 이상한 줄이 있습니다. 띄어쓰기나 괄호가 안 떨어졌을 수 있습니다.`);
	} else {
		say('  ○ 검색용 병음 자동 생성됨 (띄어쓰기·기호 제거)');
	}

	// ── 4. 실제로 앱이 읽을 모습 ──────────────────────────────
	const { rows: sample } = await client.query(`
		select id, hanzi, pinyin, pinyin_plain, meaning_ko, example_zh, example_ko
		from public.v_words order by id limit 5
	`);

	say('\nv_words 미리보기 (앱이 읽는 그대로)');
	for (const r of sample) {
		say(`  ${r.id}  ${r.hanzi}  ${r.pinyin} (${r.pinyin_plain})  ${r.meaning_ko}`);
		if (r.example_zh) say(`            ${r.example_zh}  →  ${r.example_ko}`);
	}

	// ── 5. 권한이 걸려 있나 ───────────────────────────────────
	const { rows: rls } = await client.query(`
		select c.relname as table_name, c.relrowsecurity as rls_on,
		       (select count(*) from pg_policies p
		         where p.schemaname = 'public' and p.tablename = c.relname) as policies
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relkind = 'r'
		  and c.relname in ('words','examples','progress','attempts')
		order by c.relname
	`);

	say('\n권한 (RLS)');
	for (const r of rls) {
		say(`  ${r.rls_on ? '○' : '✗'} ${r.table_name}  정책 ${r.policies}개`);
		if (!r.rls_on) problems.push(`${r.table_name} 에 RLS가 꺼져 있습니다. 누구나 마음대로 고칠 수 있습니다.`);
	}

	// ── 6. 함수 동작 ──────────────────────────────────────────
	say('\n함수');

	const { rows: daily } = await client.query(
		`select id, hanzi, frequency from public.daily_words('__check__', 5)`,
	);
	if (daily.length === 0) {
		problems.push('daily_words() 가 아무것도 안 돌려줍니다.');
		say('  ✗ daily_words() 결과 없음');
	} else {
		say(`  ○ daily_words()  ${daily.map((d) => `${d.hanzi}(${d.frequency ?? '-'})`).join(' ')}`);
		say('       괄호 안은 빈도 순위. 작을수록 자주 쓰는 말입니다');
	}

	// 검색이 제대로 좁혀지는지.
	// "결과가 나온다" 가 아니라 "엉뚱한 게 안 나온다" 를 봅니다.
	// 한자·한글로 검색할 때 병음 조건이 빈 문자열이 되어 전부 일치해버린 적이 있습니다.
	const cases = [
		{ q: '城市', want: '城市' },
		{ q: '안배', want: '安排' },
		{ q: 'anpai', want: '安排' },
		{ q: 'chengshi', want: '城市' },
	];
	for (const { q, want } of cases) {
		const { rows: hits } = await client.query(
			`select hanzi from public.search_words($1, 5)`,
			[q],
		);
		const list = hits.map((h) => h.hanzi);
		const ok = list.includes(want) && list.length <= 5;
		if (!ok) problems.push(`search_words("${q}") 가 "${want}" 를 못 찾습니다.`);
		// 검색어와 상관없는 게 잔뜩 나오면 조건이 안 걸린 것
		if (list.length > 0 && !list.includes(want)) {
			problems.push(`search_words("${q}") 가 엉뚱한 결과를 냅니다: ${list.join(' ')}`);
		}
		say(`  ${ok ? '○' : '✗'} search_words("${q}") → ${list.join(' ') || '없음'}`);
	}

	// ── 결과 ──────────────────────────────────────────────────
	if (problems.length) {
		fail('확인할 것이 있습니다.', '', ...problems.map((p) => `· ${p}`));
	}

	done(
		'전부 정상입니다.',
		'',
		`공식 3급 단어 ${c.words}개가 다 들어 있습니다.`,
		`그중 ${c.ready}개가 한국어 뜻까지 준비돼서 화면에 나옵니다.`,
		'',
		`남은 일: 한국어 뜻 ${Number(c.words) - Number(c.ready)}개 · 예문 ${Number(c.words) - Number(c.with_example)}개 · 검수 ${Number(c.words) - Number(c.verified)}개`,
	);
} catch (err) {
	if (problems.length) {
		fail('확인할 것이 있습니다.', '', ...problems.map((p) => `· ${p}`));
	}
	fail('확인하다 멈췄습니다.', '', `에러: ${err.message}`);
} finally {
	await client.end();
}
