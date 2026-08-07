'use client';

import type { Status } from './types';

/* ============================================================
   못 보낸 진도를 잠시 맡아두는 곳

   왜 필요한가:
     이 사이트는 출퇴근길에 쓰라고 만든 것입니다. 지하철에서 신호가 끊깁니다.
     그런데 진도 저장은 서버를 불러야만 됩니다.

     "저장될 때까지 다음 문제로 안 넘어간다" 로 두면, 신호가 끊긴 순간
     1번 문제에서 영영 못 나갑니다. 실제로 그랬습니다.

     그렇다고 실패를 무시하고 넘어가면, 열심히 푼 것이 조용히 사라집니다.
     그건 더 나쁩니다.

   그래서:
     못 보낸 것을 브라우저에 적어두고 다음 문제로 넘어갑니다.
     신호가 돌아오면 적어둔 것을 순서대로 다시 보냅니다.

   왜 localStorage 인가:
     창을 닫았다 열어도 남아야 합니다. 지하철에서 앱을 껐다가
     집에 와서 다시 열면 그때 보내집니다.
   ============================================================ */

const KEY = 'hsk3.pending';

export type PendingMark = {
	wordId: string;
	status: Status;
	correct: boolean;
	at: number; // 언제 푼 것인지 (밀리초)
};

function read(): PendingMark[] {
	if (typeof window === 'undefined') return [];
	try {
		const raw = window.localStorage.getItem(KEY);
		if (!raw) return [];
		const list = JSON.parse(raw);
		return Array.isArray(list) ? list : [];
	} catch {
		return []; // 저장이 막힌 브라우저(시크릿 모드 등)
	}
}

function write(list: PendingMark[]): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(KEY, JSON.stringify(list));
	} catch {
		// 저장이 막혀 있으면 어쩔 수 없습니다. 이번 회차만 못 남습니다.
	}
}

/** 못 보낸 것 하나를 적어둡니다 */
export function push(mark: PendingMark): void {
	const list = read();

	// 같은 단어를 여러 번 풀었으면 마지막 것만 남깁니다.
	// 다 보내면 seen_count 가 실제보다 부풀어서요.
	const rest = list.filter((m) => m.wordId !== mark.wordId);
	write([...rest, mark]);
}

/** 지금 몇 개나 밀려 있나 */
export function count(): number {
	return read().length;
}

export function all(): PendingMark[] {
	return read();
}

/** 보내는 데 성공한 것을 지웁니다 */
export function remove(wordId: string): void {
	write(read().filter((m) => m.wordId !== wordId));
}

/** 로그아웃·탈퇴할 때 통째로 비웁니다. 다음 사람 것에 섞이면 안 됩니다 */
export function clear(): void {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.removeItem(KEY);
	} catch {
		// 무시
	}
}

/**
 * 밀린 것을 순서대로 다시 보냅니다.
 *
 * 하나라도 실패하면 거기서 멈춥니다. 아직 신호가 안 돌아온 것이므로
 * 나머지를 계속 시도해봐야 똑같이 실패합니다.
 *
 * 돌려주는 값: 보내는 데 성공한 개수
 */
export async function flush(
	send: (m: PendingMark) => Promise<unknown>,
): Promise<number> {
	const list = read().sort((a, b) => a.at - b.at);
	let sent = 0;

	for (const mark of list) {
		try {
			await send(mark);
			remove(mark.wordId);
			sent++;
		} catch {
			break;
		}
	}
	return sent;
}
