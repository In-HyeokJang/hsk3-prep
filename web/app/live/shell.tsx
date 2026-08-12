'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Word } from '@/lib/types';

/*
  오프라인 모임 화면(`/live`)의 공용 껍데기.

  게임이 여덟 개 더 붙습니다. 화면을 덮는 방식·진행자 버튼·키 잠금은
  전부 같은 규칙을 따라야 해서 여기 한 곳에 모아둡니다.
*/

/**
 * 넘긴 직후 이만큼은 키를 무시합니다.
 *
 * 진행하는 사람은 10명을 보면서 손으로만 화면을 넘깁니다. 스페이스가
 * 두 번 먹으면 아직 아무도 답을 안 했는데 정답이 떠버립니다.
 */
export const LOCK_MS = 300;

/** 이만큼 마우스가 안 움직이면 진행자 버튼을 감춥니다 */
const HIDE_MS = 3000;

/** 마우스를 안 움직이면 사라지고, 움직이면 다시 나옵니다 */
export function useAwake(): boolean {
	const [awake, setAwake] = useState(true);

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout>;

		function wake() {
			setAwake(true);
			clearTimeout(timer);
			timer = setTimeout(() => setAwake(false), HIDE_MS);
		}

		wake();
		window.addEventListener('pointermove', wake);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('pointermove', wake);
		};
	}, []);

	return awake;
}

/**
 * 진행자 키.
 *
 * `map` 의 열쇠는 `event.key` 그대로입니다. 여기 없는 키는 건드리지 않습니다.
 * `instant` 에 적은 키는 300ms 잠금을 건너뜁니다 — 전체화면이나 나가기처럼
 * 문제를 넘기지 않는 것들입니다.
 *
 * ★ e.repeat 를 반드시 버립니다.
 *   스페이스를 지그시 누르고 있으면 브라우저가 초당 서른 번쯤 반복합니다.
 *   안 막으면 카드가 우수수 넘어갑니다.
 */
export function useLiveKeys(map: Record<string, () => void>, instant: string[] = []) {
	// 키를 누를 때마다 최신 것을 보게 합니다.
	//
	// 의존성에 map 을 그대로 넣으면 새로 그릴 때마다 이벤트를 다시 답니다.
	// 그렇다고 배열을 문자열로 이어붙여 의존성으로 쓰지도 않습니다 —
	// 앞 판에서 그렇게 했다가 이음쇠로 쓴 공백이 파일 안에서 깨져,
	// git 이 이 파일을 **바이너리로** 보게 됐습니다(변경 내역을 못 봅니다).
	// ref 에 같이 담으면 이어붙일 일 자체가 없습니다.
	const latest = useRef({ map, instant });
	latest.current = { map, instant };

	const lockedUntil = useRef(0);

	useEffect(() => {
		function onKey(e: KeyboardEvent) {
			if (e.repeat) return;

			// ★ 글자를 치는 중이면 진행자 키가 아닙니다.
			//   이 화면은 키를 window 에서 통째로 받아 preventDefault 합니다.
			//   막지 않으면 참여자 이름을 적을 때 Backspace 로 지워지지 않고
			//   1·2 를 치면 점수가 오릅니다. f 는 아예 안 써집니다.
			const el = e.target as HTMLElement | null;
			if (el?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName ?? '')) return;

			const { map: keys, instant: free } = latest.current;
			const run = keys[e.key];
			if (!run) return;

			// 스페이스는 안 막으면 페이지를 아래로 굴립니다
			e.preventDefault();

			if (!free.includes(e.key)) {
				const now = Date.now();
				if (now < lockedUntil.current) return;
				lockedUntil.current = now + LOCK_MS;
			}

			run();
		}

		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);
}

/** 전체화면 넣고 빼기 */
export function useFullscreen() {
	return useCallback(() => {
		if (document.fullscreenElement) void document.exitFullscreen();
		else void document.documentElement.requestFullscreen().catch(() => {});
	}, []);
}

/* ── 오늘 놓친 것 ─────────────────────────────────────────── */

/**
 * 모임 중에 놓친 단어를 모읍니다.
 *
 * 끝나고 한 화면에 모아 띄우면 참여자가 폰으로 찍어갑니다.
 * 다음 회 처음 10분이 여기서 시작합니다.
 *
 * ★ 서버에 안 보냅니다. 10명의 답이 사장님 개인 복습 일정에 섞이면
 *   되돌릴 방법이 없습니다.
 */
export type Missed = {
	list: Word[];
	add: (word: Word) => void;
	clear: () => void;
};

export function useMissed(): Missed {
	const [list, setList] = useState<Word[]>([]);

	// 같은 단어를 두 번 담지 않습니다. 판을 건너 다시 나오는 것은
	// 막지 않기로 했으니(기획), 같은 단어를 두 번 놓칠 수 있습니다.
	const add = useCallback((word: Word) => {
		setList((l) => (l.some((w) => w.id === word.id) ? l : [...l, word]));
	}, []);

	const clear = useCallback(() => setList([]), []);

	return { list, add, clear };
}

/* ── 팀 점수 ──────────────────────────────────────────────── */

/**
 * 팀 점수.
 *
 * ★ 개인 점수를 세지 않습니다.
 *   화면에 이름 옆 숫자를 띄우면, 제일 못하는 사람이 그걸 두 시간 동안
 *   봅니다. 다음 모임에 안 옵니다.
 *
 * ★ 점수 = 맞힌 **사람 수** 입니다.
 *   한 명이 다 맞혀도 1점, 넷이 맞히면 4점. 이러면 옆 사람을 가르치는
 *   것이 우리 팀에 이득이 됩니다. 잘하는 사람이 혼자 다 맞히는 것보다요.
 *
 * ★ 되돌리기가 반드시 있어야 합니다.
 *   진행하는 사람은 손을 세면서 키를 칩니다. 반드시 잘못 셉니다.
 *   되돌릴 수 없으면 거기서 진행이 멈추고 열 명이 기다립니다.
 */
export type Teams = {
	scores: [number, number];
	add: (team: 0 | 1) => void;
	undo: () => void;
	reset: () => void;
};

export function useTeams(): Teams {
	// ★ 점수와 "무엇을 눌렀나" 를 한 덩어리로 둡니다.
	//   따로 두면 되돌리기가 "기록을 고치면서 그 안에서 점수도 고치는"
	//   모양이 됩니다. React 는 갱신 함수를 두 번 부를 수 있어서,
	//   그러면 한 번 눌렀는데 2점이 깎입니다.
	const [state, setState] = useState<{ scores: [number, number]; history: (0 | 1)[] }>({
		scores: [0, 0],
		history: [],
	});

	const add = useCallback((team: 0 | 1) => {
		setState((s) => ({
			scores: team === 0 ? [s.scores[0] + 1, s.scores[1]] : [s.scores[0], s.scores[1] + 1],
			history: [...s.history, team],
		}));
	}, []);

	const undo = useCallback(() => {
		setState((s) => {
			const last = s.history[s.history.length - 1];
			if (last === undefined) return s;
			return {
				scores: last === 0 ? [s.scores[0] - 1, s.scores[1]] : [s.scores[0], s.scores[1] - 1],
				history: s.history.slice(0, -1),
			};
		});
	}, []);

	const reset = useCallback(() => setState({ scores: [0, 0], history: [] }), []);

	return { scores: state.scores, add, undo, reset };
}

function Scoreboard({ teams }: { teams: Teams }) {
	return (
		<div className="flex items-center gap-[2vmin] tabular-nums" style={{ fontSize: BIG.small }}>
			{(['1팀', '2팀'] as const).map((name, i) => (
				<span key={name} className="flex items-baseline gap-[0.6vmin]">
					<span className="text-muted">{name}</span>
					<span className="font-bold text-accent">{teams.scores[i]}</span>
				</span>
			))}
		</div>
	);
}

/* ── 화면을 덮는 틀 ───────────────────────────────────────── */

export type FrameProps = {
	dark: boolean;
	onDark: () => void;
	onExit: () => void;
	/** 진행자 버튼. 이전/다음처럼 게임마다 다른 것들 */
	controls?: React.ReactNode;
	/** 오른쪽 위에 작게 (진행 표시 등) */
	badge?: React.ReactNode;
	/** 점수를 세는 게임만 넘깁니다. 넘기면 점수판과 1·2·Backspace 키가 붙습니다 */
	teams?: Teams;
	/**
	 * 점수판은 보여주되 숫자 키는 게임이 직접 쓰겠다는 뜻입니다.
	 *
	 * ⑧ 한자 가족은 칸 여덟 개를 `1`~`8` 로 엽니다. 여기서 `1`·`2` 를
	 * 점수 키로 두면 첫 칸과 둘째 칸을 못 엽니다.
	 */
	teamKeys?: boolean;
	children: React.ReactNode;
};

export function LiveFrame({
	dark,
	onDark,
	onExit,
	controls,
	badge,
	teams,
	teamKeys = true,
	children,
}: FrameProps) {
	const awake = useAwake();
	const fullscreen = useFullscreen();

	// 게임이 무엇이든 이 두 개는 늘 같습니다. 게임마다 다시 달지 않습니다.
	// 문제를 넘기는 키가 아니라서 300ms 잠금도 걸지 않습니다.
	useLiveKeys(
		{
			Escape: () => {
				// 전체화면이면 전체화면만 벗습니다. 한 번에 나가버리면
				// 큰 화면을 되돌리려고 모임 중에 다시 F 를 찾아야 합니다.
				if (document.fullscreenElement) void document.exitFullscreen();
				else onExit();
			},
			f: fullscreen,
			F: fullscreen,
			// 점수는 손을 세면서 연달아 칩니다. 300ms 잠금을 걸면
			// 네 명이 맞혔는데 두 명만 들어갑니다.
			...(teams && teamKeys
				? {
						'1': () => teams.add(0),
						'2': () => teams.add(1),
						Backspace: teams.undo,
					}
				: {}),
		},
		['Escape', 'f', 'F', '1', '2', 'Backspace'],
	);

	return (
		// ★ 화면 전체를 덮습니다. layout.tsx 는 한 글자도 안 고칩니다 —
		//   이러면 max-w-5xl 도 하단 메뉴(z-20)도 같이 무력화됩니다.
		//
		// ★ 기본은 밝은 화면입니다. 프로젝터는 검정을 만들지 못해서,
		//   어두운 바탕을 깔면 화면 전체가 뿌옇게 뜹니다.
		//
		// ★ 세 줄로 나눕니다 — 위(정보) · 가운데(내용) · 아래(진행 버튼).
		//   전에는 다 겹쳐 띄웠는데, 내용이 길면 위아래가 잘려나가고
		//   버튼이 내용 위에 올라앉았습니다. 자리를 나누면 둘 다 안 생깁니다.
		<div
			// ★ 색은 사이트와 같은 이름(paper·ink·accent)을 씁니다.
			//   `live-light`/`live-dark` 가 그 이름의 값을 갈아끼웁니다(globals.css).
			//   전에는 여기에 bg-white·bg-neutral-950 을 직접 적어서,
			//   모임 화면만 초록이 없고 톤이 차가웠습니다.
			className={`fixed inset-0 z-50 flex flex-col bg-paper text-ink ${
				dark ? 'live-dark' : 'live-light'
			}`}
		>
			{/* ── 위: 점수 · 진행 표시 · 화면 버튼 ──
			     좁은 창에서는 줄이 접힙니다. 안 접으면 화면 버튼이
			     점수판 위로 올라타서 둘 다 안 읽힙니다. */}
			<div className="z-10 flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-rule-soft px-5 pb-3 pt-3">
				<div className="min-w-0 order-1">{teams && <Scoreboard teams={teams} />}</div>

				<div
					className="order-3 w-full text-center tabular-nums text-muted sm:order-2 sm:w-auto"
					style={{ fontSize: BIG.small }}
				>
					{badge}
				</div>

				{/*
					화면 버튼은 진행 버튼과 **다른 자리**에 둡니다.
					아래 한 줄에 같이 두면 '다음' 옆에 '나가기' 가 붙어서,
					모임 중에 잘못 눌러 화면이 통째로 닫힙니다.
				*/}
				<div
					className={`order-2 ml-auto flex shrink-0 gap-2 transition-opacity duration-500 sm:order-3 ${
						awake ? 'opacity-100' : 'pointer-events-none opacity-0'
					}`}
				>
					<Ctl small onClick={onDark}>
						{dark ? '밝게' : '어둡게'}
					</Ctl>
					<Ctl small onClick={fullscreen}>
						전체화면
					</Ctl>
					<Ctl small onClick={onExit}>
						나가기
					</Ctl>
				</div>
			</div>

			{/* ── 가운데: 내용. 길면 여기만 굴러갑니다 ──
			     ★ 굴러가는 칸에 items-center 를 **직접** 걸면 안 됩니다.
			       내용이 칸보다 커졌을 때 위쪽이 넘쳐서 잘리는데,
			       그 위로는 스크롤이 안 올라갑니다(아래로만 굴러갑니다).
			       헤더 밑으로 파고든 것처럼 보이는 것이 이 증상입니다.

			       그래서 굴리는 칸과 가운데 맞추는 칸을 나눕니다.
			       안쪽에 min-h-full 을 주면, 짧을 때는 가운데에 오고
			       길 때는 위에서부터 시작해 끝까지 굴러갑니다. */}
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
				<div className="flex min-h-full items-center justify-center px-6 py-4">
					{children}
				</div>
			</div>

			{/* ── 아래: 진행 버튼. 3초 안 움직이면 사라집니다 ── */}
			{controls && (
				<div
					className={`z-10 flex shrink-0 flex-wrap items-center justify-center gap-3 border-t border-rule-soft px-5 pb-4 pt-3 transition-opacity duration-500 ${
						awake ? 'opacity-100' : 'pointer-events-none opacity-0'
					}`}
				>
					{controls}
				</div>
			)}
		</div>
	);
}

export function Ctl({
	onClick,
	wide,
	small,
	children,
}: {
	onClick: () => void;
	wide?: boolean;
	/** 화면 버튼(밝게·전체화면·나가기)처럼 눈에 덜 띄어야 하는 것 */
	small?: boolean;
	children: React.ReactNode;
}) {
	return (
		// ★ 사이트의 버튼 모양을 그대로 씁니다 (`/study` 와 같은 규칙).
		//   제일 많이 누르는 것(wide = 다음·정답)만 초록 버튼이고,
		//   나머지는 테두리만 있는 버튼입니다. 진행자가 열 명을 보면서
		//   화면을 안 보고 누르는 자리라, **어느 것이 진행 버튼인지**가
		//   색으로 한눈에 갈려야 합니다.
		//
		// ★ 흐리게 만들 때 opacity 를 쓰지 않고 색 이름(text-muted)을 씁니다.
		//   버튼을 감싸는 칸이 이미 opacity 로 나타났다 사라져서,
		//   여기에 또 opacity 를 걸면 둘이 곱해져 어두운 화면에서 안 보입니다.
		<button
			onClick={onClick}
			className={`shrink-0 rounded-xl transition-colors ${
				small
					? 'border border-rule-soft px-3 py-1.5 text-sm font-medium text-muted hover:border-rule hover:text-ink-2'
					: wide
						? 'bg-accent px-10 py-3 text-base font-bold text-paper hover:bg-accent/90'
						: 'border border-rule px-5 py-3 text-base font-semibold text-ink-2 hover:border-ink-2'
			}`}
		>
			{children}
		</button>
	);
}

/* ── 큰 글자 ──────────────────────────────────────────────── */
//
// TV 해상도를 모릅니다. px 로 정하면 4K 화면에서 절반 크기로 보입니다.
// 그래서 전부 clamp() 로 잡습니다.

export const BIG = {
	hanzi: 'clamp(120px, 22vmin, 420px)',
	/** 여러 글자를 한 줄에 늘어놓을 때 */
	hanziRow: 'clamp(80px, 15vmin, 280px)',
	pinyin: 'clamp(32px, 6vmin, 110px)',
	meaning: 'clamp(28px, 5vmin, 96px)',
	line: 'clamp(20px, 3.4vmin, 64px)',
	small: 'clamp(16px, 2.4vmin, 40px)',
} as const;

export function Speaker() {
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
