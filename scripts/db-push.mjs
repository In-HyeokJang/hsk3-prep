// supabase/migrations/ 안의 SQL을 파일 이름 순서대로 실행합니다.
//
//   npm run db:push
//
// 마이그레이션은 전부 "몇 번을 실행해도 결과가 같게" 써두었습니다.
// 그래서 이 스크립트는 매번 전부 다시 실행합니다. 안전합니다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv, connect, mask, say, done, fail } from './lib.mjs';

loadEnv();

const dir = path.join(ROOT, 'supabase', 'migrations');

if (!fs.existsSync(dir)) {
	fail(`마이그레이션 폴더가 없습니다: ${dir}`);
}

const files = fs
	.readdirSync(dir)
	.filter((f) => f.endsWith('.sql'))
	.sort();

if (files.length === 0) {
	fail(`실행할 .sql 파일이 없습니다: ${dir}`);
}

say(`접속: ${mask(process.env.SUPABASE_DB_URL ?? '')}`);
say(`마이그레이션 ${files.length}개\n`);

const client = await connect();

try {
	for (const file of files) {
		const sql = fs.readFileSync(path.join(dir, file), 'utf8');
		process.stdout.write(`  ${file} ... `);

		try {
			// 파일 하나를 통째로 한 트랜잭션에 넣습니다.
			// 중간에 실패하면 그 파일이 한 것은 전부 되돌아갑니다.
			await client.query('begin');
			await client.query(sql);
			await client.query('commit');
			console.log('완료');
		} catch (err) {
			await client.query('rollback').catch(() => {});
			console.log('실패');
			fail(
				`${file} 을 실행하다 멈췄습니다.`,
				'',
				`에러: ${err.message}`,
				err.position ? `위치: 파일의 ${err.position}번째 글자쯤` : '',
				err.hint ? `힌트: ${err.hint}` : '',
				'',
				'이 파일이 한 작업은 전부 되돌렸습니다. 데이터베이스는 실행 전 상태 그대로입니다.',
			);
		}
	}

	const { rows } = await client.query(`
		select table_name
		from information_schema.tables
		where table_schema = 'public'
		order by table_name
	`);

	done(
		'표가 준비됐습니다.',
		'',
		'만들어진 것: ' + rows.map((r) => r.table_name).join(', '),
		'',
		'다음: npm run db:seed',
	);
} finally {
	await client.end();
}
