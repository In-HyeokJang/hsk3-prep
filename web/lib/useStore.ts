'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getProgress, getSummary, getWords, markWord, starWord } from './api';
import { useAuth } from './useAuth';
import * as pending from './pending';
import { isStarred, type Progress, type Status, type Summary, type Word } from './types';

/**
 * 세 화면이 같이 쓰는 데이터.
 *
 * 단어는 한 번만 받아서 계속 씁니다 (973개라 가볍습니다).
 * 진도는 내 것만 받아옵니다.
 *
 * ★ userKey 는 로그인한 계정의 번호입니다.
 *   서버 규칙(RLS)이 "내 줄만" 을 이 번호로 판단하므로,
 *   로그인이 끝나기 전에는 아무것도 부르지 않습니다.
 */
export function useStore() {
	const { userId, username, profileFailed, ready: authReady, signOut } = useAuth();

	const [words, setWords] = useState<Word[] | null>(null);
	const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
	const [summary, setSummary] = useState<Summary | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [pendingCount, setPendingCount] = useState(0);

	// 아래 flushPending 을 담아두는 곳.
	// 아래에서 만들어지는데 위쪽 useEffect 가 써야 해서, 값만 담아 씁니다.
	// (useEffect 의 신호로 쓰면 함수가 새로 만들어질 때마다 다시 실행됩니다)
	const flushPendingRef = useRef<() => Promise<number>>(async () => 0);

	const load = useCallback(async (key: string) => {
		setLoading(true);
		setError(null);
		try {
			const [w, p, s] = await Promise.all([getWords(), getProgress(key), getSummary()]);
			setWords(w);
			setProgress(p);
			setSummary(s);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!authReady) return;
		if (!userId) {
			// 로그아웃 상태. 화면은 로그인 안내로 넘어갑니다.
			setProgress(new Map());
			setLoading(false);
			return;
		}
		void load(userId);
	}, [authReady, userId, load]);

	// 밀린 것이 있으면 화면을 열 때와 신호가 돌아왔을 때 다시 보냅니다.
	useEffect(() => {
		if (!userId) return;
		setPendingCount(pending.count());

		const retry = () => void flushPendingRef.current();
		retry(); // 지금 한 번
		window.addEventListener('online', retry);
		return () => window.removeEventListener('online', retry);
	}, [userId]);

	/**
	 * 상태를 저장합니다.
	 *
	 * 서버가 저장했다고 확인해준 다음에 화면을 바꿉니다.
	 *
	 * ★ 다만 신호가 끊겼을 때는 다릅니다.
	 *   못 보낸 것을 브라우저에 적어두고 다음 문제로 넘어갑니다 (lib/pending.ts).
	 *   "저장될 때까지 못 넘어감" 으로 두면 지하철에서 1번 문제에 갇힙니다.
	 *   그렇다고 그냥 버리면 푼 것이 조용히 사라집니다. 둘 다 안 됩니다.
	 *
	 * 돌려주는 값: 저장됐으면 서버가 준 진도, 밀렸으면 null
	 */
	const mark = useCallback(
		async (wordId: string, status: Status, correct?: boolean) => {
			if (!userId) throw new Error('로그인이 필요합니다');

			try {
				const saved = await markWord(userId, wordId, status, correct);
				setProgress((prev) => {
					const next = new Map(prev);
					next.set(wordId, saved);
					return next;
				});
				setPendingCount(pending.count());
				return saved;
			} catch (e) {
				// ★ 못 보냈다고 버리지 않습니다.
				//   지하철에서 신호가 끊기면 여기로 옵니다. 적어뒀다가 나중에 보냅니다.
				//   던지지 않으므로 화면은 다음 문제로 넘어갑니다.
				pending.push({ wordId, status, correct: correct === true, at: Date.now() });
				setPendingCount(pending.count());

				// 화면에 보이는 진도는 먼저 바꿔둡니다. 서버와는 나중에 맞춰집니다.
				setProgress((prev) => {
					const next = new Map(prev);
					const before = prev.get(wordId);
					next.set(wordId, {
						word_id: wordId,
						status,
						seen_count: (before?.seen_count ?? 0) + 1,
						correct_count: (before?.correct_count ?? 0) + (correct === true ? 1 : 0),
						wrong_count: (before?.wrong_count ?? 0) + (correct === false ? 1 : 0),
					});
					return next;
				});
				return null;
			}
		},
		[userId],
	);

	/**
	 * 즐겨찾기 별표를 켜고 끕니다.
	 *
	 * 서버가 저장했다고 확인해준 뒤에 화면을 바꿉니다.
	 *
	 * ★ 못 보낸 것을 적어두지 않습니다 (mark 와 다릅니다).
	 *   진도는 못 보내면 푼 것이 사라지지만, 별표는 다시 누르면 그만입니다.
	 *   여기까지 밀린 것 목록을 만들면, 나중에 보낼 때 순서가 꼬여서
	 *   껐던 별표가 되살아나는 쪽이 더 나쁩니다.
	 */
	const star = useCallback(
		async (wordId: string, on: boolean) => {
			if (!userId) throw new Error('로그인이 필요합니다');

			const saved = await starWord(wordId, on);
			setProgress((prev) => {
				const next = new Map(prev);
				next.set(wordId, saved);
				return next;
			});
			return saved;
		},
		[userId],
	);

	/** 밀린 것을 다시 보냅니다. 신호가 돌아왔을 때 불립니다. */
	const flushPending = useCallback(async () => {
		if (!userId || pending.count() === 0) return 0;

		const sent = await pending.flush((m) => markWord(userId, m.wordId, m.status, m.correct));
		setPendingCount(pending.count());

		if (sent > 0) {
			// 서버가 다시 계산한 값으로 맞춰둡니다
			try {
				setProgress(await getProgress(userId));
			} catch {
				// 다음 기회에
			}
		}
		return sent;
	}, [userId]);

	flushPendingRef.current = flushPending;

	const statusOf = useCallback(
		(id: string): Status => progress.get(id)?.status ?? 'new',
		[progress],
	);

	const knownCount = [...progress.values()].filter((p) => p.status === 'known').length;

	return {
		userKey: userId ?? '',
		username,
		profileFailed,
		signedIn: !!userId,
		authReady,

		// 로그아웃하면 밀린 것도 비웁니다. 다음 사람 진도에 섞이면 안 됩니다.
		signOut: async () => {
			pending.clear();
			setPendingCount(0);
			return signOut();
		},

		words,
		progress,
		statusOf,
		knownCount,

		// 진도의 분모는 "공식 3급 전체(973)" 입니다.
		//
		// 화면에 나오는 단어 수(ready)를 분모로 쓰면,
		// 자료를 채울 때마다 분모가 늘어서 내 퍼센트가 거꾸로 내려갑니다.
		// 열심히 외웠는데 숫자가 줄면 그것만큼 맥 빠지는 게 없습니다.
		totalAll: summary?.total ?? words?.length ?? 0,
		ready: summary?.ready ?? words?.length ?? 0,

		mark,
		star,
		/** 이 단어에 별표가 켜져 있나 */
		starredOf: (id: string) => isStarred(progress.get(id)),
		/** 별표를 켜둔 단어 수 */
		starCount: [...progress.values()].filter(isStarred).length,

		/** 아직 서버에 못 보낸 문제 수. 0이면 다 저장된 것입니다 */
		pendingCount,
		flushPending,

		loading: loading || !authReady,
		error,
		reload: () => userId && load(userId),
	};
}
