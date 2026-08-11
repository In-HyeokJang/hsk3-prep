'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getWords } from '@/lib/api';
import { useCanSpeak } from '@/lib/speak';
import type { Word } from '@/lib/types';
import { useAuth } from '@/lib/useAuth';
import { ErrorBox, Loading } from '@/components/ui';
import Blank from './Blank';
import Cards from './Cards';
import Coop from './Coop';
import Explain from './Explain';
import Hands from './Hands';
import Hanzi from './Hanzi';
import Listen from './Listen';
import Relay from './Relay';
import ToneGym from './ToneGym';
import { BIG, Ctl, LiveFrame, useTeams } from './shell';

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

type Game = 'home' | 'cards' | 'tone' | 'coop' | 'blank' | 'listen' | 'hanzi' | 'hands' | 'explain' | 'relay';

/** `needsVoice` 인 게임은 목소리가 없는 기기에서 목록에 안 나옵니다 */
const MENU: { id: Game; name: string; about: string; needsVoice?: true }[] = [
	{ id: 'tone', name: '① 성조 체조', about: '몇 성인지 몸으로. 전원 동시' },
	{ id: 'blank', name: '② 빈칸 채우기', about: '가린 예문 · 카드 4개 중 동시에' },
	{ id: 'listen', name: '③ 귀로 잡기', about: '소리만 두 번 · 한자 4개 중', needsVoice: true },
	{ id: 'explain', name: '④ 설명해서 맞히기', about: '등 지고 앉기 · 한국어로 설명 · 60초' },
	{ id: 'hands', name: '⑤ 빨리 손들기', about: '한자만 크게 · 맞히면 다음 문제 쉼' },
	{ id: 'relay', name: '⑥ 성조 릴레이', about: '마이크 판정 · 자원자만 · 맨 뒤 13분' },
	{ id: 'hanzi', name: '⑧ 한자 가족 열기', about: '가운데 글자 하나 · 번호를 눌러 열기' },
	{ id: 'coop', name: '⑦ 다 같이 살리기', about: '경쟁 없음. 판의 마지막에' },
	{ id: 'cards', name: '단어 넘기기', about: '한자 → 병음 → 뜻. 게임 아님' },
];

/* ── 회차 범위 ───────────────────────────────────────────── */

/** 973단어를 빈도로 여섯 등분합니다. 회차당 약 162개 */
const SESSIONS = 6;

/**
 * 그 회차가 쓸 단어.
 *
 * `getWords()` 가 이미 **빈도순**으로 주기 때문에 그냥 잘라 쓰면 됩니다.
 * 1회차가 제일 자주 쓰는 말이고, 뒤로 갈수록 드문 말입니다.
 *
 * `null` 이면 973개 전부입니다.
 */
function rangeOf(words: Word[], session: number | null): Word[] {
	if (session === null) return words;
	const size = Math.ceil(words.length / SESSIONS);
	return words.slice((session - 1) * size, session * size);
}

/* ── 참여자 이름 ─────────────────────────────────────────── */

const NAMES_KEY = 'hsk3.live.names';
/** 6~10명을 봅니다. 넉넉히 잡되 끝은 둡니다 */
const MAX_NAMES = 20;
const MAX_LEN = 12;

/**
 * 저장해둔 이름을 읽습니다.
 *
 * ★ 저장소 값을 그대로 믿지 않습니다.
 *   손으로 고칠 수 있는 자리라, 길이와 개수를 여기서 다시 자릅니다.
 */
function readNames(): string[] {
	try {
		const raw = JSON.parse(localStorage.getItem(NAMES_KEY) ?? '[]');
		if (!Array.isArray(raw)) return [];
		return raw
			.filter((n): n is string => typeof n === 'string')
			.map((n) => n.trim().slice(0, MAX_LEN))
			.filter(Boolean)
			.slice(0, MAX_NAMES);
	} catch {
		return [];
	}
}

function NameBox({ names, onSave }: { names: string[]; onSave: (next: string[]) => void }) {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState(names.join('\n'));

	if (!open) {
		return (
			<button
				onClick={() => {
					setText(names.join('\n'));
					setOpen(true);
				}}
				className="opacity-45 underline-offset-4 hover:underline"
				style={{ fontSize: BIG.small }}
			>
				참여자 {names.length ? `${names.length}명` : '이름 적기'}
			</button>
		);
	}

	return (
		<div className="flex flex-col items-center gap-[1.5vmin]">
			<textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				rows={6}
				placeholder={'한 줄에 한 명\n민수\n지영'}
				className="w-[40vmin] rounded-xl border border-current/25 bg-transparent p-[1.5vmin] text-center"
				style={{ fontSize: BIG.small }}
			/>
			<div className="flex gap-[1.5vmin]">
				<Ctl
					onClick={() => {
						onSave(
							text
								.split('\n')
								.map((n) => n.trim().slice(0, MAX_LEN))
								.filter(Boolean)
								.slice(0, MAX_NAMES),
						);
						setOpen(false);
					}}
				>
					저장
				</Ctl>
				<Ctl onClick={() => setOpen(false)}>취소</Ctl>
			</div>
		</div>
	);
}

function LiveHome() {
	const router = useRouter();

	const [words, setWords] = useState<Word[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [game, setGame] = useState<Game>('home');
	// 몇 회차 범위로 할까. null 이면 973개 전부입니다
	const [session, setSession] = useState<number | null>(null);
	const [dark, setDark] = useState(false); // 프로젝터는 검정을 못 만듭니다

	// 점수는 게임 하나가 아니라 **판 전체**를 따라갑니다.
	// 게임을 옮겨도 이어지도록 여기서 들고 있습니다.
	const teams = useTeams();

	// ★ 목소리가 없는 기기면 듣기 게임을 목록에서 뺍니다.
	//   소리가 안 나는 채로 시작하면 10명이 앉아서 기다리게 됩니다.
	//   null 은 "아직 확인 중" 이라 그때는 보여둡니다 — 처음 값만 보고
	//   없다고 하면 되는 기기에서도 게임이 사라집니다.
	const canSpeak = useCanSpeak();

	// 참여자 이름. 무작위 지목(⑦)과 쉬는 사람 표시(⑤)가 씁니다.
	// 서버에 안 보냅니다 — 모임 진행용이고, 남의 이름을 저장할 이유가 없습니다.
	const [names, setNames] = useState<string[]>([]);
	useEffect(() => setNames(readNames()), []);

	const saveNames = useCallback((next: string[]) => {
		setNames(next);
		try {
			localStorage.setItem(NAMES_KEY, JSON.stringify(next));
		} catch {
			// 저장이 안 돼도 이번 모임은 굴러갑니다
		}
	}, []);

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

	// ★ 게임에는 **회차 범위만** 넘깁니다.
	//   전체를 넘기고 게임 안에서 자르면 게임마다 자르는 규칙이 갈립니다.
	const pool = rangeOf(words, session);
	const shared = { words: pool, dark, onDark: toggleDark, onExit: exit };

	if (game === 'cards') return <Cards {...shared} />;
	if (game === 'tone') return <ToneGym {...shared} onBack={home} teams={teams} />;
	if (game === 'blank') return <Blank {...shared} onBack={home} teams={teams} />;
	if (game === 'listen') return <Listen {...shared} onBack={home} teams={teams} />;
	if (game === 'hanzi') return <Hanzi {...shared} onBack={home} teams={teams} />;
	if (game === 'hands') return <Hands {...shared} onBack={home} teams={teams} names={names} />;
	if (game === 'explain') return <Explain {...shared} onBack={home} teams={teams} />;
	if (game === 'relay') return <Relay {...shared} onBack={home} teams={teams} />;
	// ⑦ 은 협동입니다. 팀 점수판을 일부러 안 넘깁니다
	if (game === 'coop') return <Coop {...shared} onBack={home} names={names} />;

	return (
		<LiveFrame
			dark={dark}
			onDark={toggleDark}
			onExit={exit}
			teams={teams}
			controls={<Ctl onClick={teams.reset}>점수 0으로</Ctl>}
		>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[4vmin]">
				<h1 className="live-han font-bold" style={{ fontSize: BIG.meaning }}>
					오늘 뭐 할까요
				</h1>

				{/* 회차 — 게임보다 먼저 정합니다 */}
				<div className="flex flex-wrap items-center justify-center gap-[1vmin]">
					{([null, 1, 2, 3, 4, 5, 6] as const).map((n) => (
						<button
							key={String(n)}
							onClick={() => setSession(n)}
							className={`rounded-xl border px-[2vmin] py-[0.9vmin] transition-colors ${
								session === n ? 'border-current/60 bg-current/10' : 'border-current/20 opacity-45'
							}`}
							style={{ fontSize: BIG.small }}
						>
							{n === null ? '전체' : `${n}회차`}
						</button>
					))}
					<span className="opacity-35" style={{ fontSize: BIG.small }}>
						{pool.length}단어
					</span>
				</div>

				<div className="flex flex-wrap items-stretch justify-center gap-[2vmin]">
					{MENU.filter((m) => !m.needsVoice || canSpeak !== false).map((m) => (
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
					진행자 키 — Space 다음 · ← 이전 · Enter 정답 · 1·2 팀 득점 · Backspace 점수 취소
					<br />F 전체화면 · Esc 나가기
				</p>

				{canSpeak === false && (
					<p className="opacity-40" style={{ fontSize: BIG.small }}>
						이 기기에는 중국어 목소리가 없어서 소리를 쓰는 게임은 뺐습니다.
					</p>
				)}

				<NameBox names={names} onSave={saveNames} />

				<p className="opacity-30" style={{ fontSize: BIG.small }}>
					점수는 <b>맞힌 사람 수</b>입니다. 넷이 맞히면 4점 — 옆 사람을 가르치는 게 이득입니다.
				</p>
			</div>
		</LiveFrame>
	);
}
