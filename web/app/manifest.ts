import type { MetadataRoute } from 'next';

// 홈 화면에 설치했을 때 어떤 모습으로 뜰지 정하는 파일입니다.
// 브라우저가 /manifest.webmanifest 주소로 이걸 읽어갑니다.

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: 'HSK 3급 단어장',
		short_name: 'HSK 3급',
		description: '출퇴근길 10분으로 HSK 3급 단어를 외웁니다.',
		lang: 'ko',
		start_url: '/',
		scope: '/',
		// standalone = 주소창 없이 앱처럼 뜹니다
		display: 'standalone',
		orientation: 'portrait',
		background_color: '#f5f7f3',
		theme_color: '#1f6b4f',
		categories: ['education'],
		icons: [
			{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
			{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
			// 안드로이드는 아이콘을 동그랗게 잘라내기도 해서, 안쪽에만 그린 것을 따로 줍니다
			{ src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
		],
		shortcuts: [
			{ name: '오늘의 단어', url: '/' },
			{ name: '학습', url: '/study' },
			{ name: '단어장', url: '/words' },
		],
	};
}
