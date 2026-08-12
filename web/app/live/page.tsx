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
import { BIG, Ctl, LiveFrame, useLiveKeys, useMissed, useTeams } from './shell';

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

type Game = 'home' | 'cards' | 'tone' | 'coop' | 'blank' | 'listen' | 'hanzi' | 'hands' | 'explain' | 'relay' | 'wrap';

/** `needsVoice` 인 게임은 목소리가 없는 기기에서 목록에 안 나옵니다 */
const MENU: { id: Game; name: string; about: string; needsVoice?: true }[] = [
	{ id: 'tone', name: '① 성조 체조', about: '몇 성인지 몸으로. 전원 동시' },
	{ id: 'blank', name: '② 빈칸 채우기', about: '가린 예문 · 카드 4개 중 동시에' },
	{ id: 'listen', name: '③ 귀로 잡기', about: '소리만 두 번 · 한자 4개 중', needsVoice: true },
	{ id: 'explain', name: '④ 설명해서 맞히기', about: '등 지고 앉기 · 한국어로 설명 · 60초' },
	{ id: 'hands', name: '⑤ 빨리 손들기', about: '한자만 크게 · 맞히면 다음 문제 쉼' },
	{ id: 'relay', name: '⑥ 성조 릴레이', about: '마이크 판정 · 자원자만 · 맨 뒤 13분' },
	{ id: 'coop', name: '⑦ 다 같이 살리기', about: '경쟁 없음. 판의 마지막에' },
	{ id: 'hanzi', name: '⑧ 한자 가족 열기', about: '가운데 글자 하나 · 번호를 눌러 열기' },
	{ id: 'cards', name: '단어 넘기기', about: '한자 → 병음 → 뜻. 게임 아님' },
	{ id: 'wrap', name: '마무리 · 오늘 놓친 것', about: '한 화면에 모아서 · 폰으로 찍어가게' },
];

/* ── 게임 규칙 ───────────────────────────────────────────── */

/**
 * 게임에 들어가기 전에 한 번 띄웁니다.
 *
 * ★ 진행자가 **읽어주는 화면**입니다.
 *   참여자는 규칙을 모른 채 앉아 있고, 진행자도 여덟 개를 다 외우고
 *   있을 수 없습니다. 라운드를 시작할 때마다 이걸 띄우고 소리 내어
 *   읽으면 그게 곧 규칙 설명이 됩니다.
 *
 * Space 한 번이면 넘어가니, 이미 아는 게임이면 바로 시작하면 됩니다.
 */
type Rule = { one: string; steps: string[]; keys: string };

const RULES: Partial<Record<Game, Rule>> = {
	tone: {
		one: '밑줄 친 글자가 몇 성인지 몸으로 답합니다. 전원 동시.',
		steps: [
			'단어와 뜻이 뜹니다. 글자 하나에만 밑줄이 있어요',
			'"하나 둘 셋" 을 세고, 셋에 다 같이 몸으로 답합니다',
			'1성 팔 옆으로 · 2성 아래→위 · 3성 내렸다 올림 · 4성 위→아래 · 경성 어깨 으쓱',
			'맞힌 사람 수만큼 팀 점수를 누릅니다',
		],
		keys: 'Space 세기 · H 힌트(둘로 좁히기) · ← 이전 · 1·2 득점 · M 놓침',
	},
	blank: {
		one: '단어를 가린 예문을 보고, 보기 4개 중 카드로 답합니다.',
		steps: [
			'가려진 예문이 뜹니다. 보기는 A~D',
			'15초 안에 카드(또는 손가락 1~4)를 동시에 듭니다',
			'5초 남으면 뜻이 힌트로 켜집니다',
			'맞힌 사람 수만큼 팀 점수를 누릅니다',
		],
		keys: 'Space 정답 · ← 이전 · 1·2 득점 · M 놓침',
	},
	listen: {
		one: '소리만 두 번 듣고 한자 4개 중 고릅니다.',
		steps: [
			'한자를 감춘 채 소리가 두 번 납니다',
			'보기 한자 4개 중 카드로 답합니다',
			'다시 듣기는 두 번까지 (R)',
			'상급을 켜면 보기 없이 종이에 병음을 받아쓰고 옆 팀과 바꿔 채점합니다',
		],
		keys: 'Space 정답 · R 다시 듣기 · 1·2 득점 · M 놓침',
	},
	explain: {
		one: '한 명이 등을 지고 앉고, 나머지가 한국어로 설명합니다. 60초.',
		steps: [
			'맞힐 사람 한 명이 화면에 등을 지고 앉습니다',
			'나머지가 한국어로 설명합니다. 몸짓도 됩니다',
			'그 한자·병음·뜻을 그대로 말하면 안 됩니다 (화면이 금지어를 띄웁니다)',
			'화면이 같이 띄우는 한자 가족과 예문은 써도 됩니다',
		],
		keys: 'Space 맞힘 · → 통과 · 시작 전에 팀을 고릅니다',
	},
	hands: {
		one: '한자만 크게. 먼저 손 든 사람이 뜻을 말로 답합니다.',
		steps: [
			'한자가 뜨면 먼저 손 든 사람이 뜻을 말합니다',
			'8초가 지나면 병음이 힌트로 켜집니다',
			'맞힌 사람 이름을 누르면 그 사람은 다음 두세 문제를 쉽니다',
			'한 사람이 다 가져가지 않게 하려는 규칙입니다',
		],
		keys: 'Space 정답 · ← 이전 · 1·2 득점 · M 놓침',
	},
	relay: {
		one: '한 명씩 나와 한 글자를 발음합니다. 자원자만.',
		steps: [
			'자원하는 사람만 나옵니다. 지목하지 않습니다',
			'마이크에 대고 그 글자를 발음합니다',
			'마이크 판정은 참고일 뿐입니다',
			'통과인지 아닌지는 진행자가 O/X 로 정합니다',
		],
		keys: 'O 통과 · X 아직 · → 넘기기',
	},
	hanzi: {
		one: '가운데 글자가 든 단어 여덟 개를 팀이 번갈아 맞혀 엽니다.',
		steps: [
			'가운데 글자 하나와 가려진 칸 여덟 개가 뜹니다',
			'차례인 팀이 그 글자가 든 단어를 하나 댑니다',
			'맞으면 진행자가 그 칸 번호를 누릅니다. 열리고 1점',
			'못 맞히면 Space 로 차례만 넘깁니다',
		],
		keys: '1~8 칸 열기 · Space 차례 넘기기 · Backspace 방금 취소',
	},
	coop: {
		one: '경쟁 없음. 전원 대 화면. 판의 마지막에 합니다.',
		steps: [
			'화면이 답할 사람을 무작위로 지목합니다',
			'팀 전체가 15초 상의합니다',
			'마지막 말은 지목된 사람이 합니다',
			'8문제 중 4개면 다 같이 통과. 목숨은 없습니다',
		],
		keys: 'O 맞음 · X 틀림 · Space 다음',
	},
};

function RulesScreen({
	rule,
	name,
	dark,
	onDark,
	onExit,
	onStart,
	onBack,
}: {
	rule: Rule;
	name: string;
	dark: boolean;
	onDark: () => void;
	onExit: () => void;
	onStart: () => void;
	onBack: () => void;
}) {
	useLiveKeys({ ' ': onStart, Enter: onStart });

	return (
		<LiveFrame
			dark={dark}
			onDark={onDark}
			onExit={onExit}
			controls={
				<>
					<Ctl onClick={onStart} wide>
						시작 (Space)
					</Ctl>
					<Ctl onClick={onBack}>게임 고르기</Ctl>
				</>
			}
		>
			<div
				className="flex w-full max-w-2xl flex-col items-center gap-4 text-center"
				style={{ fontSize: BIG.small }}
			>
				<h1 className="font-bold" style={{ fontSize: BIG.meaning }}>
					{name}
				</h1>
				<p className="opacity-70" style={{ fontSize: BIG.line }}>
					{rule.one}
				</p>

				<ol className="flex w-full flex-col gap-2 rounded-2xl border border-current/15 px-5 py-4 text-left">
					{rule.steps.map((step, i) => (
						<li key={i} className="flex gap-3">
							<span className="shrink-0 tabular-nums opacity-30">{i + 1}</span>
							<span className="opacity-80">{step}</span>
						</li>
					))}
				</ol>

				<p className="opacity-35">{rule.keys}</p>
			</div>
		</LiveFrame>
	);
}

/* ── 회차별 판 짜기 ──────────────────────────────────────── */

/**
 * 그 회차에 무엇을 하나 (`docs/13-offline-game.md` 의 회차별 초점 표).
 *
 * ★ 매주 같은 게임을 하는 것이 아닙니다.
 *   앞 회차는 **성조 감각**, 뒤로 갈수록 **듣기와 문장**으로 옮겨갑니다.
 *
 * ★ 45분에는 **게임 두 개 + 마무리 하나**가 상한입니다.
 *   기획서는 120분(판 25분 × 3)을 전제로 게임 하나를 6분으로 잡았는데,
 *   그건 게임 로직만 센 값입니다. 실제로는 하나당 10~12분이 듭니다 —
 *   규칙 읽어주기 1.5분 + 응답 방식 전환 2분 + **형식 적응 손실**
 *   (새 방식의 첫 두세 문제는 내용이 아니라 "답하는 법"에 머리를 씁니다).
 *
 * ★ 응답 방식이 같으면 전환이 거의 공짜입니다.
 *   ②와 ③은 둘 다 손가락/카드로 답해서 이어 붙이기 좋습니다.
 *   몸으로 하는 ①과 섞는 회차는 두 개가 상한입니다.
 *
 * ★ 마지막은 늘 ⑦ 다 같이 살리기입니다.
 *   진 팀도 같은 편으로 끝내고 쉬는 시간에 들어갑니다.
 *
 * ★ ④ 설명하기 · ⑥ 릴레이 · ⑧ 한자 가족은 판에서 뺐습니다.
 *   초급에게 **보기 없이 스스로 떠올리기**를 요구하는 것들이고,
 *   ④는 1회차 범위의 36%가 `了 把 被` 같은 어법어라 한국어로
 *   설명할 방법이 없습니다. 목록에서 직접 고를 수는 있습니다.
 */
type Plan = { focus: string; games: Game[] };

const PLANS: Record<number, Plan> = {
	1: { focus: '성조 4개 감각 잡기 · 모임 규칙 익히기', games: ['tone', 'blank'] },
	2: { focus: '두 글자 단어의 성조 짝', games: ['tone', 'listen'] },
	3: { focus: '듣기 시작', games: ['listen', 'tone'] },
	4: { focus: '헷갈리는 발음 짝 (sh/s · ü/u · -n/-ng)', games: ['listen', 'blank'] },
	5: { focus: '문장 단위', games: ['blank', 'hands'] },
	6: { focus: '종합 · 여섯 회 통째로', games: ['listen', 'hands'] },
};

/** 판마다 맨 끝에 붙는 것 */
const CLOSER: Game = 'coop';

/** 판 이름은 게임 수에서 만듭니다. 문자열로 박아두면 개수를 바꿀 때 어긋납니다 */
function planLabels(count: number): string[] {
	return [...Array.from({ length: count - 1 }, (_, i) => `판 ${i + 1}`), '마무리'];
}

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
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				{names.length > 0 ? (
					<span className="opacity-75">{names.join(' · ')}</span>
				) : (
					<span className="opacity-35">아직 없음</span>
				)}
				<button
					onClick={() => {
						setText(names.join('\n'));
						setOpen(true);
					}}
					className="rounded-lg border border-current/25 px-2.5 py-1 opacity-55 transition-opacity hover:opacity-100"
				>
					{names.length ? '고치기' : '이름 적기'}
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-start gap-2">
			<textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				rows={5}
				placeholder={'한 줄에 한 명\n민수\n지영'}
				className="w-full max-w-sm rounded-xl border border-current/25 bg-transparent p-3"
				style={{ fontSize: BIG.small }}
			/>
			<div className="flex gap-2">
				<Ctl
					small
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
				<Ctl small onClick={() => setOpen(false)}>
					취소
				</Ctl>
			</div>
		</div>
	);
}

/**
 * 시작 화면의 한 칸.
 *
 * 번호 · 제목 · **왜 필요한지**를 늘 같은 자리에 둡니다.
 * 앞 판에서는 회차 단추와 게임 단추와 안내문이 그냥 세로로 쌓여 있어서,
 * 무엇을 먼저 정해야 하는지가 화면에 안 나와 있었습니다.
 */
function Step({
	no,
	title,
	why,
	children,
}: {
	no: number;
	title: string;
	why: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2 border-t border-current/10 pt-4 first:border-t-0 first:pt-0">
			<div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
				<span className="tabular-nums opacity-30">{no}</span>
				<h2 className="font-bold">{title}</h2>
				<span className="opacity-40">{why}</span>
			</div>
			{children}
		</section>
	);
}

/* ── 마무리 · 오늘 놓친 것 ───────────────────────────────── */

/**
 * 모임 끝에 한 화면에 모아 띄웁니다. 참여자가 **폰으로 찍어갑니다.**
 * 다음 회 처음 10분이 여기서 시작합니다.
 *
 * ★ 글자 크기를 개수에 따라 줄입니다.
 *   서른 개가 넘어가면 화면 밖으로 나가는데, 찍어가는 화면에서
 *   잘려나간 줄은 없는 것과 같습니다.
 */
function Wrap({
	missed,
	dark,
	onDark,
	onExit,
	onBack,
}: {
	missed: ReturnType<typeof useMissed>;
	dark: boolean;
	onDark: () => void;
	onExit: () => void;
	onBack: () => void;
}) {
	const n = missed.list.length;
	const size = n > 24 ? BIG.small : n > 12 ? BIG.line : BIG.pinyin;

	return (
		<LiveFrame
			dark={dark}
			onDark={onDark}
			onExit={onExit}
			controls={
				<>
					<Ctl onClick={missed.clear}>지우기</Ctl>
					<Ctl onClick={onBack}>게임 고르기</Ctl>
				</>
			}
		>
			<div className="flex w-full max-w-[92vw] flex-col items-center gap-[2vmin] text-center">
				<h1 className="font-bold" style={{ fontSize: BIG.meaning }}>
					오늘 놓친 것 {n > 0 && `· ${n}개`}
				</h1>

				{n === 0 ? (
					<p className="opacity-45" style={{ fontSize: BIG.line }}>
						아직 없습니다. 게임 중에 <b>M</b> 을 누르면 그 단어가 여기 담깁니다.
					</p>
				) : (
					<>
						{/* 가운데 칸이 알아서 굴러가므로 여기서 높이를 자르지 않습니다.
						    잘라두면 서른 개가 넘을 때 아래쪽이 통째로 안 보입니다. */}
						<div className="flex flex-wrap items-start justify-center gap-x-[2.5vmin] gap-y-[1.2vmin]">
							{missed.list.map((w) => (
								<span key={w.id} className="flex items-baseline gap-[0.6vmin]" style={{ fontSize: size }}>
									<span className="live-han">{w.hanzi}</span>
									<span className="live-pinyin opacity-55">{w.pinyin}</span>
									<span className="opacity-75">{w.meaning_ko}</span>
								</span>
							))}
						</div>
						<p className="opacity-35" style={{ fontSize: BIG.small }}>
							폰으로 찍어가세요. 다음 모임 처음 10분은 여기서 시작합니다.
						</p>
					</>
				)}
			</div>
		</LiveFrame>
	);
}

function LiveHome() {
	const router = useRouter();

	const [words, setWords] = useState<Word[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [game, setGame] = useState<Game>('home');
	// 규칙을 읽는 중인 게임. 시작을 누르면 game 으로 넘어갑니다
	const [reading, setReading] = useState<Game | null>(null);
	// 몇 회차 범위로 할까. null 이면 973개 전부입니다
	const [session, setSession] = useState<number | null>(null);
	const [dark, setDark] = useState(false); // 프로젝터는 검정을 못 만듭니다

	// 점수는 게임 하나가 아니라 **판 전체**를 따라갑니다.
	// 게임을 옮겨도 이어지도록 여기서 들고 있습니다.
	const teams = useTeams();

	// 오늘 놓친 것. 게임들이 여기 담고, 마무리 화면이 한 번에 띄웁니다.
	const missed = useMissed();

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
	const home = useCallback(() => {
		setGame('home');
		setReading(null);
	}, []);

	// 규칙이 있는 게임은 규칙부터 띄웁니다. 없는 것(단어 넘기기·마무리)은 바로.
	const pick = useCallback((id: Game) => {
		if (RULES[id]) setReading(id);
		else setGame(id);
	}, []);

	if (error) return <ErrorBox message={error} onRetry={load} />;
	if (!words) return <Loading text="단어를 받는 중..." />;
	if (words.length === 0) return <Notice title="단어가 없습니다" body="자료를 먼저 넣어주세요." />;

	// 오늘 판 — 경쟁 셋 + 협동 마무리 + 맨 뒤 마이크
	const base = session ? PLANS[session] : undefined;
	const plan =
		base &&
		(() => {
			const order = [...base.games, CLOSER] as Game[];
			return { focus: base.focus, order, labels: planLabels(order.length) };
		})();

	// ★ 게임에는 **회차 범위만** 넘깁니다.
	//   전체를 넘기고 게임 안에서 자르면 게임마다 자르는 규칙이 갈립니다.
	const pool = rangeOf(words, session);
	const shared = { words: pool, dark, onDark: toggleDark, onExit: exit, onMiss: missed.add };

	// 규칙을 읽는 중이면 그것부터
	const readingRule = reading ? RULES[reading] : undefined;
	if (reading && readingRule) {
		return (
			<RulesScreen
				rule={readingRule}
				name={MENU.find((m) => m.id === reading)?.name ?? ''}
				dark={dark}
				onDark={toggleDark}
				onExit={exit}
				onStart={() => {
					setGame(reading);
					setReading(null);
				}}
				onBack={home}
			/>
		);
	}

	// 단어 넘기기는 게임이 아니라 놓친 것을 안 담습니다
	if (game === 'cards')
		return <Cards words={pool} dark={dark} onDark={toggleDark} onExit={exit} />;

	if (game === 'wrap')
		return (
			<Wrap
				missed={missed}
				dark={dark}
				onDark={toggleDark}
				onExit={exit}
				onBack={home}
			/>
		);
	if (game === 'tone') return <ToneGym {...shared} onBack={home} teams={teams} />;
	if (game === 'blank') return <Blank {...shared} onBack={home} teams={teams} />;
	if (game === 'listen') return <Listen {...shared} onBack={home} teams={teams} />;
	if (game === 'hanzi') return <Hanzi {...shared} all={words} onBack={home} teams={teams} />;
	if (game === 'hands') return <Hands {...shared} onBack={home} teams={teams} names={names} />;
	if (game === 'explain') return <Explain {...shared} onBack={home} teams={teams} />;
	if (game === 'relay') return <Relay {...shared} onBack={home} teams={teams} />;
	// ⑦ 은 협동입니다. 팀 점수판을 일부러 안 넘깁니다
	if (game === 'coop') return <Coop {...shared} onBack={home} names={names} />;

	return (
		// ★ 시작 화면에는 점수판을 안 띄웁니다.
		//   게임 밖에서 `1팀 0 2팀 0` 만 덩그러니 있으면 그게 뭔지 알 수가
		//   없습니다. 아래 3번 칸에서 무엇인지 설명하고 같이 보여줍니다.
		<LiveFrame dark={dark} onDark={toggleDark} onExit={exit}>
			<div
				className="flex w-full max-w-3xl flex-col gap-5 py-2"
				style={{ fontSize: BIG.small }}
			>
				<h1 className="font-bold" style={{ fontSize: BIG.line }}>
					모임 준비
				</h1>

				{/* ── 1. 오늘 범위 ── */}
				<Step no={1} title="오늘 범위" why="자주 쓰는 말부터 여섯 등분했습니다">
					<div className="flex flex-wrap items-center gap-1.5">
						{([null, 1, 2, 3, 4, 5, 6] as const).map((n) => (
							<button
								key={String(n)}
								onClick={() => setSession(n)}
								className={`rounded-lg border px-3 py-1.5 transition-colors ${
									session === n
										? 'border-current/60 bg-current/10 font-medium'
										: 'border-current/20 opacity-45 hover:opacity-80'
								}`}
							>
								{n === null ? '전체' : `${n}회차`}
							</button>
						))}
						<span className="ml-1 opacity-35">{pool.length}단어</span>
					</div>
				</Step>

				{/* ── 2. 참여자 ── */}
				<Step
					no={2}
					title="참여자"
					why="⑦ 무작위 지목과 ⑤ 쉬는 차례에 씁니다. 안 적어도 나머지는 됩니다"
				>
					<NameBox names={names} onSave={saveNames} />
				</Step>

				{/* ── 3. 팀 점수 ── */}
				<Step
					no={3}
					title="팀 점수"
					why="두 팀으로 나눠 앉습니다 (6명이면 3+3, 10명이면 5+5)"
				>
					<div className="flex flex-wrap items-center gap-x-5 gap-y-2">
						<span className="flex items-baseline gap-2 tabular-nums">
							<span className="opacity-45">1팀</span>
							<b>{teams.scores[0]}</b>
							<span className="ml-3 opacity-45">2팀</span>
							<b>{teams.scores[1]}</b>
						</span>
						<Ctl small onClick={teams.reset}>
							0으로
						</Ctl>
					</div>
					<p className="opacity-40">
						게임 중에 <b>1</b> · <b>2</b> 를 눌러 셉니다. 점수는 <b>맞힌 사람 수</b>예요 — 넷이
						맞히면 4점이라, 옆 사람을 가르치는 게 우리 팀에 이득입니다. 잘못 셌으면{' '}
						<b>Backspace</b>.
					</p>
				</Step>

				{/* ── 4. 오늘 판 ──
				     회차마다 게임 조합이 다릅니다. 앞은 성조 감각, 뒤로 갈수록
				     듣기와 문장. 그래서 여섯 주가 같은 게임의 반복이 아닙니다. */}
				{plan && (
					<Step no={4} title={`${session}회차 판`} why={plan.focus}>
						<ol className="flex flex-col gap-2">
							{plan.order.map((g, i) => {
								const m = MENU.find((x) => x.id === g);
								if (!m) return null;
								const off = m.needsVoice && canSpeak === false;
								return (
									<li key={`${g}-${i}`} className="flex items-center gap-3">
										<span className="w-14 shrink-0 opacity-35">{plan.labels[i]}</span>
										<button
											disabled={off}
											onClick={() => pick(g)}
											className={`flex flex-1 items-baseline gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
												off
													? 'cursor-not-allowed border-current/10 opacity-30'
													: 'border-current/20 hover:bg-current/5'
											}`}
										>
											<span className="font-bold">{m.name}</span>
											<span className="opacity-45">{m.about}</span>
										</button>
									</li>
								);
							})}
						</ol>
						<p className="opacity-40">
							게임 하나에 <b>10~12분</b>씩 · 규칙 읽어주고 답하는 법 익히는 시간까지요. 셋이면
							45분에 안 들어갑니다. 마지막은 늘 <b>⑦ 다 같이 살리기</b> — 진 팀도 같은 편으로
							쉬는 시간에 들어가게요.
						</p>
					</Step>
				)}

				{/* ── 5. 그 밖의 게임 ── */}
				<Step
					no={plan ? 5 : 4}
					title={plan ? '그 밖에' : '무엇을 할까'}
					why={plan ? '판을 바꾸고 싶으면 여기서 골라도 됩니다' : '고르면 규칙이 먼저 뜹니다'}
				>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
						{MENU.filter((m) => !m.needsVoice || canSpeak !== false).map((m) => (
							<button
								key={m.id}
								onClick={() => pick(m.id)}
								className="flex flex-col items-start gap-0.5 rounded-xl border border-current/20 px-3 py-2.5 text-left transition-colors hover:bg-current/5"
							>
								<span className="font-bold">{m.name}</span>
								<span className="opacity-50">{m.about}</span>
							</button>
						))}
					</div>

					{canSpeak === false && (
						<p className="opacity-40">
							이 기기에는 중국어 목소리가 없어서 소리를 쓰는 게임(③)은 뺐습니다.
						</p>
					)}
				</Step>
			</div>
		</LiveFrame>
	);
}
