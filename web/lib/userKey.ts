// 로그인 대신 쓰는 임시 번호.
//
// 처음 사이트에 들어오면 브라우저에 아무 번호(UUID)를 하나 만들어 저장해두고,
// 그 번호로 내 진도를 구분합니다.
//
// 좋은 점 — 회원가입 화면도, 비밀번호도, 로그인 에러도 없습니다.
// 한계   — 폰에서 보던 진도가 노트북에는 안 나옵니다.
//          브라우저 기록을 지우면 진도도 사라집니다.

const STORAGE_KEY = 'hsk3.userKey';

/** 브라우저에 저장된 번호를 읽습니다. 없으면 만들어서 저장합니다. */
export function getUserKey(): string {
	if (typeof window === 'undefined') return '';

	try {
		const saved = window.localStorage.getItem(STORAGE_KEY);
		if (saved) return saved;

		const fresh =
			typeof crypto?.randomUUID === 'function'
				? crypto.randomUUID()
				: // 아주 오래된 브라우저 대비
					`k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

		window.localStorage.setItem(STORAGE_KEY, fresh);
		return fresh;
	} catch {
		// 사파리 시크릿 모드처럼 저장이 막힌 경우.
		// 이번 방문 동안만 쓰는 번호를 돌려줍니다. 새로고침하면 진도가 초기화됩니다.
		return 'temporary';
	}
}

/** 저장이 막혀 있는지 (진도가 안 남을 상황인지) */
export function isStorageBlocked(): boolean {
	if (typeof window === 'undefined') return false;
	try {
		window.localStorage.setItem('hsk3.test', '1');
		window.localStorage.removeItem('hsk3.test');
		return false;
	} catch {
		return true;
	}
}
