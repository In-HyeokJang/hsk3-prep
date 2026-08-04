'use client';

import { useCallback, useEffect, useState } from 'react';
import { getProgress, getSummary, getWords, markWord } from './api';
import { useAuth } from './useAuth';
import type { Progress, Status, Summary, Word } from './types';

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
	const { userId, username, ready: authReady, signOut } = useAuth();

	const [words, setWords] = useState<Word[] | null>(null);
	const [progress, setProgress] = useState<Map<string, Progress>>(new Map());
	const [summary, setSummary] = useState<Summary | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

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

	/**
	 * 상태를 저장합니다.
	 *
	 * ★ 서버가 저장했다고 확인해준 다음에 화면을 바꿉니다.
	 *   먼저 화면부터 바꾸면, 저장에 실패해도 성공한 것처럼 보입니다.
	 *   그 사실은 나중에 열어봤을 때야 드러나고, 그때는 이미 늦습니다.
	 */
	const mark = useCallback(
		async (wordId: string, status: Status, correct?: boolean) => {
			if (!userId) throw new Error('로그인이 필요합니다');
			const saved = await markWord(userId, wordId, status, correct);
			setProgress((prev) => {
				const next = new Map(prev);
				next.set(wordId, saved);
				return next;
			});
			return saved;
		},
		[userId],
	);

	const statusOf = useCallback(
		(id: string): Status => progress.get(id)?.status ?? 'new',
		[progress],
	);

	const knownCount = [...progress.values()].filter((p) => p.status === 'known').length;

	return {
		userKey: userId ?? '',
		username,
		signedIn: !!userId,
		authReady,
		signOut,

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
		loading: loading || !authReady,
		error,
		reload: () => userId && load(userId),
	};
}
