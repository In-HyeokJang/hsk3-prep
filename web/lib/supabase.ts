import { createClient } from '@supabase/supabase-js';

// 이 두 값은 브라우저에 그대로 노출됩니다. 비밀이 아닙니다.
// 진짜 비밀(DB 비밀번호)은 이 폴더에 아예 없습니다 — 프로젝트 맨 위에만 있습니다.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
	throw new Error(
		'Supabase 주소나 키가 없습니다.\n' +
			'프로젝트 맨 위에서 `npm run env:sync` 를 실행하면 web/.env.local 이 만들어집니다.',
	);
}

export const supabase = createClient(url, key, {
	auth: {
		// 로그인 상태를 브라우저에 저장해서, 창을 닫았다 열어도 그대로 있게 합니다.
		// 저장되는 건 시간이 지나면 만료되는 표(토큰)이지 비밀번호가 아닙니다.
		persistSession: true,
		autoRefreshToken: true,
		detectSessionInUrl: true,
	},
});
