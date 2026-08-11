'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getWords } from '@/lib/api';
import { speak } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { useAuth } from '@/lib/useAuth';
import { ErrorBox, Loading } from '@/components/ui';

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
 *   나중에 저장이나 유료 자료를 다루게 되면 그때는 서버(RLS·함수)에
 *   is_admin() 을 걸어야 합니다.
 */
export default function LivePage() {
	const { isAdmin, profileFailed, ready } = useAuth();

	if (!ready) return <Loading text="확인하는 중..." />;

	// ★ 못 받아온 것과 "관리자가 아니다" 는 다릅니다.
	//   신호가 끊겨 프로필을 못 받았는데 "권한 없음" 이라고 말해버리면,
	//   진행하는 사람은 자기 계정이 잘못된 줄 알고 모임 중에 헤맵니다.
	//   무엇이 문제인지 다르게 말해줘야 합니다.
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

	return <LiveScreen />;
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

/* ── 화면 ────────────────────────────────────────────────── */

/**
 * 얼마나 공개했나.
 *   0 한자만 · 1 +병음 · 2 +뜻·예문
 */
const LAST_STEP = 2;

/**
 * 넘긴 직후 이만큼은 키를 무시합니다.
 *
 * 진행하는 사람은 10명을 보면서 손으로만 화면을 넘깁니다. 스페이스가
 * 두 번 먹으면 아직 아무도 답을 안 했는데 정답이 떠버립니다.
 * ←로 되돌릴 수는 있지만, 이미 본 답은 되돌려지지 않습니다.
 */
const LOCK_MS = 300;

/** 이만큼 마우스가 안 움직이면 버튼을 감춥니다 */
const HIDE_MS = 3000;

function LiveScreen() {
	const router = useRouter();

	const [words, setWords] = useState<Word[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	// ★ 자리(at)와 공개 단계(step)를 한 덩어리로 둡니다.
	//   따로 두면 "step 을 고치면서 그 안에서 at 도 고치는" 모양이 되는데,
	//   React 는 갱신 함수를 두 번 부를 수 있어서 단어가 두 칸씩 뜁니다.
	const [pos, setPos] = useState({ at: 0, step: 0 });
	const { at, step } = pos;
	const [dark, setDark] = useState(false); // 프로젝터는 검정을 못 만듭니다
	const [showButtons, setShowButtons] = useState(true);

	// ★ 시작할 때 딱 한 번만 서버를 부릅니다.
	//   useStore 를 쓰면 단어·진도·요약을 Promise.all 로 묶어서 하나만
	//   실패해도 셋 다 실패합니다. 여기는 진도가 아예 필요 없습니다.
	const load = useCallback(() => {
		setError(null);
		getWords()
			.then(setWords)
			.catch((e: unknown) => setError(e instanceof Error ? e.message : '단어를 못 받았습니다.'));
	}, []);

	useEffect(load, [load]);

	/* ── 넘기기 ───────────────────────────────────────────── */

	const lockedUntil = useRef(0);

	const next = useCallback(() => {
		setPos((p) =>
			p.step < LAST_STEP ? { at: p.at, step: p.step + 1 } : { at: p.at + 1, step: 0 },
		);
	}, []);

	const prev = useCallback(() => {
		setPos((p) =>
			p.step > 0
				? { at: p.at, step: p.step - 1 }
				: // 앞 단어로 돌아갈 때는 이미 다 본 상태로 보여줍니다.
					// 다시 한 단계씩 열게 하면 진행이 끊깁니다.
					{ at: Math.max(0, p.at - 1), step: LAST_STEP },
		);
	}, []);

	const revealAll = useCallback(() => setPos((p) => ({ at: p.at, step: LAST_STEP })), []);

	const toggleFullscreen = useCallback(() => {
		if (document.fullscreenElement) void document.exitFullscreen();
		else void document.documentElement.requestFullscreen().catch(() => {});
	}, []);

	/* ── 키보드 ───────────────────────────────────────────── */

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			// ★ 누르고 있으면 브라우저가 초당 30번쯤 반복합니다.
			//   이걸 안 막으면 스페이스를 지그시 누르는 순간 카드가 우수수 넘어갑니다.
			if (e.repeat) return;

			const key = e.key;
			const handled = [' ', 'ArrowRight', 'ArrowLeft', 'Enter', 'f', 'F', 'Escape'];
			if (!handled.includes(key)) return;

			// 스페이스는 안 막으면 페이지를 아래로 굴립니다
			e.preventDefault();

			if (key === 'Escape') {
				// 전체화면이면 전체화면만 벗습니다. 한 번에 나가버리면
				// 큰 화면을 되돌리려고 모임 중에 다시 F를 찾아야 합니다.
				if (document.fullscreenElement) void document.exitFullscreen();
				else router.push('/');
				return;
			}

			if (key === 'f' || key === 'F') return toggleFullscreen();

			const now = Date.now();
			if (now < lockedUntil.current) return;
			lockedUntil.current = now + LOCK_MS;

			if (key === 'Enter') revealAll();
			else if (key === 'ArrowLeft') prev();
			else next();
		}

		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [next, prev, revealAll, router, toggleFullscreen]);

	/* ── 마우스를 안 움직이면 버튼을 감춥니다 ─────────────── */

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;

		function wake() {
			setShowButtons(true);
			clearTimeout(timer);
			timer = setTimeout(() => setShowButtons(false), HIDE_MS);
		}

		wake();
		window.addEventListener('pointermove', wake);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('pointermove', wake);
		};
	}, []);

	/* ── 그리기 ───────────────────────────────────────────── */

	if (error) return <ErrorBox message={error} onRetry={load} />;
	if (!words) return <Loading text="단어를 받는 중..." />;
	if (words.length === 0) return <Notice title="단어가 없습니다" body="자료를 먼저 넣어주세요." />;

	const word = words[Math.min(at, words.length - 1)];
	const done = at >= words.length;

	return (
		// ★ 화면 전체를 덮습니다. layout.tsx 는 한 글자도 안 고칩니다 —
		//   이러면 max-w-5xl 도 하단 메뉴(z-20)도 같이 무력화됩니다.
		<div
			className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 ${
				dark ? 'bg-neutral-950 text-neutral-50' : 'bg-white text-neutral-900'
			}`}
		>
			{done ? (
				<div className="flex flex-col items-center gap-6 text-center">
					<p style={{ fontSize: 'clamp(28px, 5vmin, 96px)' }} className="font-bold">
						오늘은 여기까지
					</p>
					<button
						onClick={() => setPos({ at: 0, step: 0 })}
						className="rounded-xl border border-current/30 px-6 py-3 text-lg font-medium opacity-70"
					>
						처음부터 다시
					</button>
				</div>
			) : (
				<div className="flex w-full max-w-[92vw] flex-col items-center gap-[2vmin] text-center">
					{/* ① 한자 — 늘 보입니다 */}
					<div
						className="han font-bold leading-none"
						style={{ fontSize: 'clamp(120px, 22vmin, 420px)' }}
					>
						{word.hanzi}
					</div>

					{/* ② 병음 + 스피커 */}
					{step >= 1 && (
						<div className="flex items-center gap-[2vmin]">
							<span
								className="font-medium tracking-wide opacity-80"
								style={{ fontSize: 'clamp(32px, 6vmin, 110px)' }}
							>
								{word.pinyin}
							</span>
							{/* 감싸는 것이 버튼이 아니라 형제로 둡니다 (버튼 안의 버튼 금지) */}
							<button
								onClick={() => speak(word.hanzi)}
								aria-label="소리 듣기"
								className="shrink-0 rounded-full border border-current/25 p-[1.4vmin] opacity-50 transition-opacity hover:opacity-100"
							>
								<Speaker />
							</button>
						</div>
					)}

					{/* ③ 뜻 + 예문 — 세 줄을 넘기지 않습니다 */}
					{step >= LAST_STEP && (
						<>
							<div className="font-semibold" style={{ fontSize: 'clamp(28px, 5vmin, 96px)' }}>
								{word.meaning_ko}
							</div>
							{word.example_zh && (
								<div
									className="han opacity-70"
									style={{ fontSize: 'clamp(20px, 3.4vmin, 64px)' }}
								>
									{word.example_zh}
								</div>
							)}
						</>
					)}
				</div>
			)}

			{/* ── 진행 표시 · 오른쪽 위 ── */}
			<div
				// 같은 성질(opacity)을 두 번 붙이면 뒤에 쓴 것이 이기지 않습니다.
				// Tailwind 는 만들어진 CSS 차례로 이겨서, 늘 40이 남습니다.
				className={`fixed right-5 top-4 text-sm tabular-nums transition-opacity ${
					showButtons ? 'opacity-40' : 'opacity-0'
				}`}
			>
				{Math.min(at + 1, words.length)} / {words.length}
			</div>

			{/* ── 진행자 버튼 · 반투명, 3초 뒤 사라짐 ── */}
			<div
				className={`fixed inset-x-0 bottom-0 flex items-center justify-center gap-3 p-5 transition-opacity duration-500 ${
					showButtons ? 'opacity-100' : 'pointer-events-none opacity-0'
				}`}
			>
				<Ctl onClick={prev}>← 이전</Ctl>
				<Ctl onClick={next} wide>
					{step < LAST_STEP ? '공개' : '다음 →'}
				</Ctl>
				<Ctl onClick={() => setDark((d) => !d)}>{dark ? '밝게' : '어둡게'}</Ctl>
				<Ctl onClick={toggleFullscreen}>전체화면</Ctl>
				<Ctl onClick={() => router.push('/')}>나가기</Ctl>
			</div>
		</div>
	);
}

function Ctl({
	onClick,
	wide,
	children,
}: {
	onClick: () => void;
	wide?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			onClick={onClick}
			className={`rounded-xl border border-current/25 bg-current/5 py-3 text-base font-medium opacity-60 backdrop-blur transition-opacity hover:opacity-100 ${
				wide ? 'px-10' : 'px-5'
			}`}
		>
			{children}
		</button>
	);
}

function Speaker() {
	return (
		<svg
			width="1em"
			height="1em"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.8"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ fontSize: 'clamp(24px, 4vmin, 72px)' }}
		>
			<path d="M11 5 6.5 9H3v6h3.5L11 19z" />
			<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" />
		</svg>
	);
}
