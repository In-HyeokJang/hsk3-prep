// 루트 .env.local 의 공개 값만 web/.env.local 로 옮겨 적습니다.
//
//   npm run env:sync
//
// 왜 필요한가:
//   루트 .env.local 에는 DB 비밀번호(SUPABASE_DB_URL)가 들어 있습니다.
//   사이트 폴더(web/)는 Vercel에 배포되는 곳이라, 그 비밀번호가 근처에도 가면 안 됩니다.
//
//   그래서 NEXT_PUBLIC_ 으로 시작하는 값만 골라서 옮깁니다.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadEnv, say, done, fail } from './lib.mjs';

loadEnv();

const webDir = path.join(ROOT, 'web');
if (!fs.existsSync(webDir)) {
	fail(
		'web/ 폴더가 아직 없습니다.',
		'',
		'3회차에서 Next.js 프로젝트를 web/ 에 만든 뒤에 실행해주세요.',
	);
}

const keys = Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC_'));

if (keys.length === 0) {
	fail(
		'루트 .env.local 에 NEXT_PUBLIC_ 으로 시작하는 값이 없습니다.',
		'',
		'.env.local.example 을 참고해서 아래 두 개를 넣어주세요:',
		'  NEXT_PUBLIC_SUPABASE_URL',
		'  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
	);
}

// 혹시라도 비밀이 섞이지 않았는지 한 번 더 확인
const suspicious = keys.filter((k) => /SECRET|SERVICE_ROLE|PASSWORD|DB_URL/i.test(k));
if (suspicious.length) {
	fail(
		'NEXT_PUBLIC_ 인데 비밀처럼 보이는 이름이 있습니다:',
		...suspicious.map((k) => `  ${k}`),
		'',
		'NEXT_PUBLIC_ 으로 시작하는 값은 브라우저에 그대로 노출됩니다.',
		'이름을 바꾸거나, 정말 공개해도 되는 값인지 확인해주세요.',
	);
}

const body =
	[
		'# 이 파일은 자동으로 만들어집니다. 직접 고치지 마세요.',
		'#   루트 .env.local 을 고치고 npm run env:sync 를 실행하면 됩니다.',
		'#',
		'# 여기에는 브라우저에 노출돼도 되는 값만 들어옵니다.',
		'# DB 비밀번호는 절대 이 파일에 오지 않습니다.',
		'',
		...keys.sort().map((k) => `${k}=${process.env[k]}`),
	].join('\n') + '\n';

const target = path.join(webDir, '.env.local');
fs.writeFileSync(target, body, 'utf8');

say(`옮긴 값 ${keys.length}개:`);
for (const k of keys.sort()) say(`  ${k}`);

done(
	'web/.env.local 을 만들었습니다.',
	'',
	'DB 비밀번호는 옮기지 않았습니다. 루트에만 있습니다.',
	'',
	'web/.gitignore 에 .env.local 이 들어 있는지 한 번 확인해주세요.',
);
