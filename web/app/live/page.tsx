'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getWords } from '@/lib/api';
import type { Word } from '@/lib/types';
import { useAuth } from '@/lib/useAuth';
import { ErrorBox, Loading } from '@/components/ui';
import Cards from './Cards';
import ToneGym from './ToneGym';
import { BIG, LiveFrame } from './shell';

/**
 * 오프라인 모임 화면 `/live`.
 *
 * TV/프로젝터에 띄우고 6~10명이 다같이 보는 화면입니다.
 * 기획은 docs/13-offline-game.md, 작업 목록은 docs/14-wbs3.md 에 있습니다.
 *
 * ★ 아무것도 저장하지 않습니다.
 *   mark_word 도 log_attempt 도 부르지 않습니다. 10명의 답이 사장님 개인
 *   복습 일정에 섞이면 되돌릴 방법이 없습니다 (attempts 는 지울 권한이
 *   아무에게도 없습니다).
 *
 * ★ 이 문지기가 지키지 못하는 것
 *   기술을 아는 사람이 주소를 직접 치고 들어오는 것은 막지 못합니다.
 *   다만 이 화면이 읽는 v_words 는 이미 anon 에게 열려 있어서
 *   새로 새는 정보가 0입니다. 모임 진행용으로는 이걸로 충분합니다.
 */
export default function LivePage() {
	const { isAdmin, profileFailed, ready } = useAuth();

	/**
	 * 한 번 들여보냈으면 모임이 끝날 때까지 안 내보냅니다.
	 *
	 * AuthGate 만 고치면 반쪽입니다. 토큰이 만료되면 프로필도 같이 비고,
	 * 그러면 여기가 "관리자가 아닙니다" 로 바뀌어 결국 모임이 끊깁니다.
	 * 들어올 때 관리자인 것을 이미 확인했으니, 그 뒤에 신호가 끊긴 것은
	 * 권한이 없어진 것이 아닙니다.
	 */
	const admitted = useRef(false);
	useEffect(() => {
		if (isAdmin) admitted.current = true;
	}, [isAdmin]);

	if (!ready) return <Loading text="확인하는 중..." />;
	if (admitted.current) return <LiveHome />;

	// ★ 못 받아온 것과 "관리자가 아니다" 는 다릅니다.
	//   신호가 끊겨 프로필을 못 받았는데 "권한 없음" 이라고 말해버리면,
	//   진행하는 사람은 자기 계정이 잘못된 줄 알고 모임 중에 헤맵니다.
	if (!isAdmin && profileFailed) {
		return (
			<Notice
				title="계정을 확인하지 못했습니다"
				body="신호가 잠깐 끊긴 것 같습니다. 잠시 뒤에 새로고침해 주세요."
			/>
		);
	}

	if (!isAdmin) {
		return (
			<Notice
				title="모임 진행용 화면입니다"
				body="오프라인 모임을 진행하는 사람만 쓰는 화면이에요. 학습은 아래 메뉴에서 이어가시면 됩니다."
			/>
		);
	}

	return <LiveHome />;
}

function Notice({ title, body }: { title: string; body: string }) {
	return (
		<div className="flex flex-col items-start gap-3 rounded-xl border border-rule px-5 py-6">
			<h1 className="text-base font-bold tracking-tight">{title}</h1>
			<p className="text-sm leading-relaxed text-muted">{body}</p>
			<Link href="/" className="text-sm font-medium text-accent">
				오늘의 단어로 →
			</Link>
		</div>
	);
}

/* ── 무엇을 할까 ─────────────────────────────────────────── */

type Game = 'home' | 'cards' | 'tone';

const MENU: { id: Game; name: string; about: string }[] = [
	{ id: 'tone', name: '① 성조 체조', about: '몇 성인지 몸으로. 전원 동시' },
	{ id: 'cards', name: '단어 넘기기', about: '한자 → 병음 → 뜻. 게임 아님' },
];

function LiveHome() {
	const router = useRouter();

	const [words, setWords] = useState<Word[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [game, setGame] = useState<Game>('home');
	const [dark, setDark] = useState(false); // 프로젝터는 검정을 못 만듭니다

	// ★ 시작할 때 딱 한 번만 서버를 부릅니다.
	//   useStore 를 쓰면 단어·진도·요약을 Promise.all 로 묶어서 하나만
	//   실패해도 셋 다 실패합니다. 여기는 진도가 아예 필요 없습니다.
	//   한 번 받아두면 그 뒤로 서버를 안 부르니 모임 중에 신호가 끊겨도
	//   끝까지 굴러갑니다.
	const load = useCallback(() => {
		setError(null);
		getWords()
			.then(setWords)
			.catch((e: unknown) => setError(e instanceof Error ? e.message : '단어를 못 받았습니다.'));
	}, []);

	useEffect(load, [load]);

	const exit = useCallback(() => router.push('/'), [router]);
	const toggleDark = useCallback(() => setDark((d) => !d), []);
	const home = useCallback(() => setGame('home'), []);

	if (error) return <ErrorBox message={error} onRetry={load} />;
	if (!words) return <Loading text="단어를 받는 중..." />;
	if (words.length === 0) return <Notice title="단어가 없습니다" body="자료를 먼저 넣어주세요." />;

	const shared = { words, dark, onDark: toggleDark, onExit: exit };

	if (game === 'cards') return <Cards {...shared} />;
	if (game === 'tone') return <ToneGym {...shared} onBack={home} />;

	return (
		<LiveFrame dark={dark} onDark={toggleDark} onExit={exit}>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[4vmin]">
				<h1 className="live-han font-bold" style={{ fontSize: BIG.meaning }}>
					오늘 뭐 할까요
				</h1>

				<div className="flex flex-wrap items-stretch justify-center gap-[2vmin]">
					{MENU.map((m) => (
						<button
							key={m.id}
							onClick={() => setGame(m.id)}
							className="flex min-w-[36vmin] flex-col items-start gap-[1vmin] rounded-2xl border border-current/20 px-[3vmin] py-[2.5vmin] text-left transition-colors hover:bg-current/5"
						>
							<span className="font-bold" style={{ fontSize: BIG.line }}>
								{m.name}
							</span>
							<span className="opacity-55" style={{ fontSize: BIG.small }}>
								{m.about}
							</span>
						</button>
					))}
				</div>

				<p className="opacity-40" style={{ fontSize: BIG.small }}>
					진행자 키 — Space 다음 · ← 이전 · Enter 정답 · F 전체화면 · Esc 나가기
				</p>
			</div>
		</LiveFrame>
	);
}
