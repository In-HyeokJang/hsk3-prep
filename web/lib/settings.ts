'use client';

import { useSyncExternalStore } from 'react';

/**
 * 화면 설정. 이 사람의 브라우저에만 남습니다.
 *
 * 서버에 저장하지 않습니다 — 진도와 달리 "이 폰에서 어떻게 보고 싶은가" 라서,
 * 폰에서는 병음을 보고 컴퓨터에서는 안 보는 것도 괜찮습니다.
 */

/* ── 설정 하나를 만드는 틀 ─────────────────────────────────
   설정이 둘이 되면서 같은 코드를 두 번 쓰게 됐습니다.
   담아두기·알려주기·저장하기가 똑같아서 틀로 묶었습니다.

   왜 이렇게까지 하나:
     · localStorage 를 그릴 때마다 읽으면 React 가 "값이 계속 바뀐다" 고 봅니다.
       그래서 여기 담아두고, 저장할 때만 같이 고칩니다.
     · 두 화면(홈·학습)이 같은 값을 봐야 합니다. 한쪽에서 바꾸면 다른 쪽도
       바로 따라가게, 바뀔 때 알려줄 사람들을 적어둡니다.
     · 서버에는 localStorage 가 없습니다. 서버에서는 늘 기본값으로 그리고,
       브라우저에 도착한 뒤 진짜 값으로 한 번 다시 그립니다.
       그 셋째 인자를 빼면 "서버가 그린 것과 다르다" 는 오류가 납니다. */

function makeSetting<T>(key: string, fallback: T, decode: (raw: string) => T, encode: (v: T) => string) {
	const listeners = new Set<() => void>();
	let value: T | null = null;

	const read = (): T => {
		if (value !== null) return value;
		try {
			const saved = localStorage.getItem(key);
			value = saved === null ? fallback : decode(saved);
		} catch {
			// 저장 공간이 막혀 있어도 화면은 돌아가야 합니다
			value = fallback;
		}
		return value;
	};

	const subscribe = (fn: () => void) => {
		listeners.add(fn);
		return () => listeners.delete(fn);
	};

	return {
		use: () => useSyncExternalStore(subscribe, read, () => fallback),
		set: (next: T) => {
			value = next;
			try {
				localStorage.setItem(key, encode(next));
			} catch {
				// 저장은 못 했어도 이번에 바꾼 것은 살아 있습니다
			}
			listeners.forEach((fn) => fn());
		},
	};
}

/* ── 문제에 병음 보이기 ─────────────────────────────────────
   처음 쓰는 사람은 꺼진 상태로 시작합니다. 병음이 보이면 문제가 너무 쉬워져서요. */

const pinyin = makeSetting('hsk3:show-pinyin', false, (raw) => raw === '1', (v) => (v ? '1' : '0'));

export const useShowPinyin = pinyin.use;
export const setShowPinyin = pinyin.set;

/* ── 하루 학습량 ───────────────────────────────────────────
   한 번에 몇 문제를 풀지. 학습·성조·오늘 화면이 다 이 값을 씁니다.

   10개가 기본입니다. 출퇴근길 한 번에 끝나는 양이라서요.
   5개는 "오늘은 도저히 시간이 없다" 는 날에도 끊기지 않게,
   20개는 주말에 몰아서 할 때를 위한 것입니다.

   ★ 아무 숫자나 받지 않습니다. 저장된 값이 이상하면 기본값으로 돌립니다.
     localStorage 는 사람이 직접 고칠 수 있는 자리라, 거기 들어온 값을
     그대로 믿고 서버에 넘기면 "9999문제" 같은 것이 만들어집니다. */

export const DAILY_CHOICES = [5, 10, 20] as const;
export type DailyCount = (typeof DAILY_CHOICES)[number];

const DAILY_DEFAULT: DailyCount = 10;

/**
 * 저장된 글자를 학습량으로 바꿉니다. 목록에 없는 값은 전부 기본값(10)입니다.
 *
 * 따로 꺼내둔 이유: 이 값이 그대로 서버에 "몇 개 주세요" 로 넘어갑니다.
 * 브라우저 저장소는 사람이 손으로 고칠 수 있는 자리라, 거기 들어온 것을
 * 믿으면 "9999문제" 같은 것이 만들어집니다.
 */
export function toDailyCount(raw: string | null): DailyCount {
	const n = Number(raw);
	return (DAILY_CHOICES as readonly number[]).includes(n) ? (n as DailyCount) : DAILY_DEFAULT;
}

const daily = makeSetting<DailyCount>(
	'hsk3:daily-count',
	DAILY_DEFAULT,
	toDailyCount,
	(v) => String(v),
);

export const useDailyCount = daily.use;
export const setDailyCount = daily.set;
