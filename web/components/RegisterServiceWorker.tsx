'use client';

import { useEffect } from 'react';

// 서비스 워커를 등록합니다. 화면에는 아무것도 그리지 않습니다.
//
// 개발 중에는 등록하지 않습니다.
// 개발 서버는 파일이 계속 바뀌는데 캐시가 끼어들면
// "고쳤는데 화면이 그대로" 라는 헷갈리는 상황이 생기거든요.

export default function RegisterServiceWorker() {
	useEffect(() => {
		if (process.env.NODE_ENV !== 'production') return;
		if (!('serviceWorker' in navigator)) return;

		const register = () => {
			navigator.serviceWorker.register('/sw.js').catch(() => {
				// 등록에 실패해도 사이트는 그대로 동작합니다. 오프라인만 안 될 뿐이에요.
			});
		};

		if (document.readyState === 'complete') register();
		else window.addEventListener('load', register, { once: true });
	}, []);

	return null;
}
