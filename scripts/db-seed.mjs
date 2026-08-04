// data/ 안의 단어 CSV를 읽어서 words 와 examples 표에 넣습니다.
//
//   npm run db:seed              → data/words-*.csv 전부
//   npm run db:seed -- 101-200   → 파일 이름에 101-200 이 들어간 것만
//
// ★ 몇 번을 실행해도 결과가 같습니다.
//   같은 단어는 새로 넣지 않고 덮어씁니다 (on conflict do update).
//   그래서 CSV의 뜻이나 예문을 고친 뒤 그냥 다시 돌리시면 됩니다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv, connect, parseCsv, say, done, fail } from './lib.mjs';

loadEnv();

const filter = process.argv[2] ?? '';
const dataDir = path.join(ROOT, 'data');

const files = fs
	.readdirSync(dataDir)
	.filter((f) => f.startsWith('words-') && f.endsWith('.csv'))
	.filter((f) => !f.includes('sample'))
	.filter((f) => f.includes(filter))
	.sort();

if (files.length === 0) {
	fail(
		filter
			? `data/ 에 이름에 "${filter}" 가 들어간 words-*.csv 가 없습니다.`
			: 'data/ 에 words-*.csv 파일이 없습니다.',
	);
}

// ── CSV를 먼저 전부 읽고 검사합니다 (DB는 아직 안 건드림) ────

// 단어 하나를 hsk_id 로 모읍니다.
//
// 파일이 여러 개일 때 같은 번호가 겹치는 건 정상입니다.
//   words-l3-101-973.csv  → 한자·병음만 있는 뼈대
//   words-l3-freq-*.csv   → 거기에 한국어 뜻과 예문을 얹는 파일
//
// 규칙: 값이 있는 쪽이 이깁니다. 빈 칸은 앞서 읽은 값을 덮지 않습니다.
// 그래서 뼈대 파일이 나중에 읽혀도 한국어 뜻이 지워지지 않습니다.
const merged = new Map();

const put = (row, where) => {
	const cur = merged.get(row.hsk_id) ?? { hsk_id: row.hsk_id, _where: where };
	for (const [k, v] of Object.entries(row)) {
		if (v !== '' && v != null) cur[k] = v;
	}
	merged.set(row.hsk_id, cur);
};

for (const file of files) {
	const seenInFile = new Set();
	let rows;
	try {
		rows = parseCsv(fs.readFileSync(path.join(dataDir, file), 'utf8'));
	} catch (err) {
		fail(`${file} 을 읽지 못했습니다.`, '', err.message);
	}

	for (const [i, r] of rows.entries()) {
		const where = `${file} ${i + 2}번째 줄`;

		// meaning_ko 는 비어 있어도 됩니다. 아직 안 쓴 단어라는 뜻이에요.
		for (const col of ['hsk_id', 'hanzi', 'pinyin']) {
			if (!r[col]) fail(`${where}: ${col} 칸이 비어 있습니다.`);
		}

		// 같은 파일 안에서 겹치는 건 실수입니다. 파일끼리 겹치는 건 정상입니다.
		if (seenInFile.has(r.hsk_id)) {
			fail(`${where}: hsk_id "${r.hsk_id}" 가 이 파일 안에 두 번 있습니다.`);
		}
		seenInFile.add(r.hsk_id);

		// 한자가 깨졌는지 미리 걸러냅니다
		if (/[?�]/.test(r.hanzi)) {
			fail(
				`${where}: 한자가 깨져 있습니다 → "${r.hanzi}"`,
				'',
				'CSV 인코딩 문제입니다. 엑셀로 열고 저장하셨다면 원본이 망가진 것입니다.',
				'VSCode로 열어서 오른쪽 아래가 UTF-8 인지 확인해주세요.',
			);
		}

		put(r, where);
	}
}

// 모은 것을 DB에 넣을 모양으로 펼칩니다
const words = [];
const examples = [];

for (const r of merged.values()) {
	words.push([
		r.hsk_id,
		r.hanzi,
		r.pinyin,
		r.pos || null,
		r.meaning_ko || null,
		r.level ? Number(r.level) : 3,
		r.topic || null,
		r.meaning_en || null,
		r.frequency ? Number(r.frequency) : null,
	]);

	if (r.example_zh) {
		examples.push([r.hsk_id, 1, r.example_zh, r.example_pinyin || null, r.example_ko || null]);
	}
}

const withKo = words.filter((w) => w[4]).length;

say(`파일 ${files.length}개: ${files.join(', ')}`);
say(`단어 ${words.length}개 (한국어 뜻 있음 ${withKo}개) · 예문 ${examples.length}개\n`);

// ── 넣기 ─────────────────────────────────────────────────────

const client = await connect();

try {
	await client.query('begin');

	// 표가 있는지 먼저 확인
	const { rows: check } = await client.query(`
		select to_regclass('public.words') as w, to_regclass('public.examples') as e
	`);
	if (!check[0].w || !check[0].e) {
		await client.query('rollback');
		fail('words 또는 examples 표가 아직 없습니다.', '', '먼저 이걸 실행해주세요:', '  npm run db:push');
	}

	// unnest 로 한 번에 넣습니다. 100줄이든 973줄이든 왕복 한 번.
	const w = await client.query(
		`insert into public.words
		   (id, hanzi, pinyin, pos, meaning_ko, hsk_level, topic, meaning_en, frequency)
		 select * from unnest(
		   $1::text[], $2::text[], $3::text[], $4::text[],
		   $5::text[], $6::smallint[], $7::text[], $8::text[], $9::integer[]
		 )
		 on conflict (id) do update set
		   hanzi      = excluded.hanzi,
		   pinyin     = excluded.pinyin,
		   hsk_level  = excluded.hsk_level,
		   -- ★ coalesce 가 중요합니다.
		   --   CSV에 빈 칸이면 지금 들어 있는 값을 그대로 둡니다.
		   --   이게 없으면 한국어 뜻을 다 써놓은 단어가
		   --   뼈대 CSV를 다시 돌릴 때 통째로 지워집니다.
		   pos        = coalesce(excluded.pos,        public.words.pos),
		   meaning_ko = coalesce(excluded.meaning_ko, public.words.meaning_ko),
		   topic      = coalesce(excluded.topic,      public.words.topic),
		   meaning_en = coalesce(excluded.meaning_en, public.words.meaning_en),
		   frequency  = coalesce(excluded.frequency,  public.words.frequency)`,
		// verified 도 일부러 건드리지 않습니다.
		// 검수 표시를 해둔 단어가 시드를 다시 돌릴 때 false 로 돌아가면 안 되니까요.
		[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => words.map((row) => row[i])),
	);

	const e = examples.length
		? await client.query(
				`insert into public.examples (word_id, seq, zh, pinyin, ko)
				 select * from unnest(
				   $1::text[], $2::smallint[], $3::text[], $4::text[], $5::text[]
				 )
				 on conflict (word_id, seq) do update set
				   zh     = excluded.zh,
				   pinyin = excluded.pinyin,
				   ko     = excluded.ko`,
				[0, 1, 2, 3, 4].map((i) => examples.map((row) => row[i])),
			)
		: { rowCount: 0 };

	await client.query('commit');

	const { rows: total } = await client.query(`select * from public.v_progress_summary`);
	const t = total[0];

	done(
		`단어 ${w.rowCount}줄 · 예문 ${e.rowCount}줄 처리했습니다.`,
		'',
		`전체 ${t.total}개 중`,
		`  한국어 뜻 있음  ${t.ready}   ← 화면에 나오는 것`,
		`  예문 있음       ${t.examples}`,
		`  검수 끝         ${t.verified}`,
		'',
		'다음: npm run db:check',
	);
} catch (err) {
	await client.query('rollback').catch(() => {});
	fail(
		'넣다가 멈췄습니다. 아무것도 안 들어갔습니다.',
		'',
		`에러: ${err.message}`,
		err.detail ? `자세히: ${err.detail}` : '',
	);
} finally {
	await client.end();
}
