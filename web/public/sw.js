/*
  서비스 워커 — 브라우저가 백그라운드에 두고 돌리는 작은 프로그램입니다.

  하는 일은 두 가지뿐입니다.
    1. 한 번 받아온 화면 파일을 저장해뒀다가, 신호가 끊기면 그걸로 보여줍니다.
    2. 한 번 받아온 단어 목록도 저장해둡니다. 지하철에서 끊겨도 단어장이 열립니다.

  일부러 안 하는 것:
    · 저장(POST) 요청은 절대 캐시하지 않습니다. 안 보낸 걸 보냈다고 하면 안 되니까요.
    · 미리 받아두기(precache)를 하지 않습니다. 파일 이름이 빌드마다 바뀌어서
      목록을 손으로 관리하면 반드시 어긋납니다.
*/

// 화면을 고칠 때마다 올립니다. 안 올리면 배포해도 옛 화면이 그대로 뜹니다.
//   v2 (2026-08-11) — 오프라인 모임 화면 /live 추가
//   v3 (2026-08-12) — 45분 판 재편(L20) · 빈칸 손보기(L21) ·
//                     귀로 잡기 문제 뽑기(L22) · 소리 두 번 재생(L23)
const VERSION = 'v3';
const SHELL = `hsk3-shell-${VERSION}`;
const DATA = `hsk3-data-${VERSION}`;

// 새 버전이 준비되면 기다리지 않고 바로 넘어갑니다
self.addEventListener('install', () => {
	self.skipWaiting();
});

// 예전 버전이 남긴 캐시를 치웁니다
self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			await Promise.all(
				names.filter((n) => n !== SHELL && n !== DATA).map((n) => caches.delete(n)),
			);
			await self.clients.claim();
		})(),
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;

	// 저장하는 요청은 손대지 않습니다
	if (request.method !== 'GET') return;

	const url = new URL(request.url);

	// 크롬 확장 등은 건너뜁니다
	if (!url.protocol.startsWith('http')) return;

	const isSupabase = url.hostname.endsWith('.supabase.co');
	const isSameOrigin = url.origin === self.location.origin;

	if (!isSupabase && !isSameOrigin) return; // 글꼴 CDN 등은 브라우저에 맡깁니다

	// 단어 데이터: 새 걸 먼저 시도하고, 안 되면 저장해둔 걸 씁니다
	if (isSupabase) {
		event.respondWith(networkFirst(request, DATA));
		return;
	}

	// 화면 이동: 새 걸 먼저, 안 되면 저장해둔 걸
	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request, SHELL));
		return;
	}

	// 그림·스크립트·스타일: 저장해둔 게 있으면 그걸 먼저 (빠릅니다)
	event.respondWith(cacheFirst(request, SHELL));
});

async function networkFirst(request, cacheName) {
	const cache = await caches.open(cacheName);
	try {
		const fresh = await fetch(request);
		if (fresh && fresh.ok) cache.put(request, fresh.clone());
		return fresh;
	} catch {
		const saved = await cache.match(request);
		if (saved) return saved;
		// 저장해둔 것도 없으면 브라우저 기본 오류 화면으로
		throw new Error('offline and nothing cached');
	}
}

async function cacheFirst(request, cacheName) {
	const cache = await caches.open(cacheName);
	const saved = await cache.match(request);
	if (saved) return saved;

	const fresh = await fetch(request);
	if (fresh && fresh.ok) cache.put(request, fresh.clone());
	return fresh;
}
