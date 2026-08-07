'use client';

import { useSyncExternalStore } from 'react';

/**
 * 화면 설정. 이 사람의 브라우저에만 남습니다.
 *
 * 서버에 저장하지 않습니다 — 진도와 달리 "이 폰에서 어떻게 보고 싶은가" 라서,
 * 폰에서는 병음을 보고 컴퓨터에서는 안 보는 것도 괜찮습니다.
 */

const KEY = 'hsk3:show-pinyin';

/** 처음 쓰는 사람은 꺼진 상태로 시작합니다. 병음이 보이면 문제가 너무 쉬워져서요. */
const DEFAULT = false;

/* ── 값을 담아두는 곳 ───────────────────────────────────────
   두 화면(홈·학습)이 같은 값을 봐야 합니다.
   한쪽에서 끄면 다른 쪽도 바로 따라 꺼지게, 바뀔 때 알려줄 사람들을 적어둡니다. */

const listeners = new Set<() => void>();

// localStorage 를 그릴 때마다 읽으면 React 가 "값이 계속 바뀐다" 고 봅니다.
// 그래서 여기에 담아두고, 저장할 때만 같이 고칩니다.
let value: boolean | null = null;

function read(): boolean {
	if (value !== null) return value;
	try {
		const saved = localStorage.getItem(KEY);
		value = saved === null ? DEFAULT : saved === '1';
	} catch {
		// 저장 공간이 막혀 있어도 화면은 돌아가야 합니다
		value = DEFAULT;
	}
	return value;
}

function subscribe(fn: () => void) {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

/**
 * 병음을 보여줄지.
 *
 * ★ 서버에는 localStorage 가 없습니다. 그래서 서버에서는 늘 기본값(꺼짐)으로 그리고,
 *   브라우저에 도착한 뒤 진짜 값으로 한 번 다시 그립니다.
 *   이 셋째 인자를 빼면 "서버가 그린 것과 다르다" 는 오류가 납니다.
 */
export function useShowPinyin(): boolean {
	return useSyncExternalStore(subscribe, read, () => DEFAULT);
}

/** 켜고 끕니다. 이 값을 보고 있는 화면은 알아서 다시 그려집니다. */
export function setShowPinyin(on: boolean) {
	value = on;
	try {
		localStorage.setItem(KEY, on ? '1' : '0');
	} catch {
		// 저장은 못 했어도 이번에 켠 것은 살아 있습니다
	}
	listeners.forEach((fn) => fn());
}
