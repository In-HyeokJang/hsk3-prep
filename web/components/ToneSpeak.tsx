'use client';

import { useEffect, useRef, useState } from 'react';
import {
	baselineOf,
	detectPitch,
	judgeTone,
	TONE_HINT,
	toSemitones,
	type SpokenTone,
	type ToneGuess,
} from '@/lib/pitch';

/**
 * 성조 말해보기.
 *
 * 마이크에 대고 소리를 내면 목소리의 높낮이를 재서,
 * 그 곡선 모양이 1·2·3·4성 중 무엇인지 가려냅니다.
 *
 * ★ 성조는 절대 음높이가 아니라 상대적인 곡선입니다.
 *   사람마다 목소리 높이가 달라서, 먼저 본인 기준선을 잡아야 합니다.
 *   그래서 "아—" 하고 3초 내는 단계가 맨 앞에 있습니다.
 *
 * ★ 성조만 봅니다. "발음이 정확한가" 까지는 안 봅니다.
 *   그건 다른 문제고, 성조만 봐도 충분히 쓸모 있습니다.
 *
 * 재는 규칙은 여기 없습니다. `lib/pitch.ts` 에 숫자만 다루는 채로 따로 있습니다 —
 * 마이크에 대고 백 번 말해보는 대신 가짜 곡선으로 시험할 수 있게요.
 */

/** 한 번에 잘라 보는 소리 조각 크기. 클수록 낮은 소리까지 잡히고 반응은 느려집니다 */
const FRAME = 2048;

/** 기준선을 잡는 시간 (밀리초) */
const BASE_MS = 3000;

/** 한 번 말할 때 듣는 시간 */
const SAY_MS = 2500;

type Stage = 'idle' | 'base' | 'ready' | 'listening' | 'judged';

const TONE_LABEL: Record<SpokenTone, string> = { 1: '1성', 2: '2성', 3: '3성', 4: '4성' };

export default function ToneSpeak({
	hanzi,
	pinyin,
	tone,
	onDone,
}: {
	hanzi: string;
	pinyin: string;
	/** 내야 할 성조 */
	tone: SpokenTone;
	/** 판정이 끝났을 때. 맞았는지를 넘깁니다 */
	onDone?: (correct: boolean) => void;
}) {
	const [stage, setStage] = useState<Stage>('idle');
	const [error, setError] = useState<string | null>(null);
	const [base, setBase] = useState<number | null>(null);
	const [guess, setGuess] = useState<ToneGuess | null>(null);
	const [level, setLevel] = useState(0); // 지금 들어오는 소리 크기 (0~1)

	// 마이크 관련한 것들. 화면을 다시 그려도 살아 있어야 해서 ref 에 둡니다.
	const audioRef = useRef<AudioContext | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const stopRef = useRef<(() => void) | null>(null);

	// 화면을 벗어나면 마이크를 반드시 끕니다.
	// 안 끄면 다른 화면으로 가도 녹음 표시가 계속 켜져 있습니다.
	useEffect(() => {
		return () => {
			stopRef.current?.();
			streamRef.current?.getTracks().forEach((t) => t.stop());
			void audioRef.current?.close();
		};
	}, []);

	/** 마이크를 엽니다. 이미 열려 있으면 그대로 씁니다 */
	async function openMic(): Promise<AnalyserNode> {
		if (!audioRef.current || audioRef.current.state === 'closed') {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					// 소리 크기를 자동으로 맞추는 기능들을 끕니다.
					// 켜져 있으면 브라우저가 목소리를 주무르면서 높낮이까지 흔들립니다.
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false,
				},
			});
			streamRef.current = stream;
			const ctx = new AudioContext();
			audioRef.current = ctx;
			const source = ctx.createMediaStreamSource(stream);
			const analyser = ctx.createAnalyser();
			analyser.fftSize = FRAME;
			source.connect(analyser);
			(ctx as AudioContext & { _analyser?: AnalyserNode })._analyser = analyser;
			return analyser;
		}
		await audioRef.current.resume();
		return (audioRef.current as AudioContext & { _analyser: AnalyserNode })._analyser;
	}

	/**
	 * 정해진 시간 동안 음높이를 모읍니다.
	 *
	 * 브라우저가 그림을 그리는 박자에 맞춰 조각조각 잽니다.
	 * 소리가 안 나는 조각은 그냥 건너뜁니다 — 그 구간을 0으로 채우면
	 * 곡선에 없던 골짜기가 생겨서 3성으로 잘못 봅니다.
	 */
	function listen(analyser: AnalyserNode, ms: number): Promise<number[]> {
		return new Promise((resolve) => {
			const ctx = audioRef.current!;
			const buf = new Float32Array(analyser.fftSize);
			const got: number[] = [];
			const until = performance.now() + ms;
			let frame = 0;

			const tick = () => {
				if (performance.now() >= until) {
					stopRef.current = null;
					setLevel(0);
					resolve(got);
					return;
				}
				analyser.getFloatTimeDomainData(buf);

				let power = 0;
				for (let i = 0; i < buf.length; i++) power += buf[i] * buf[i];
				setLevel(Math.min(1, Math.sqrt(power / buf.length) * 8));

				const hz = detectPitch(buf, ctx.sampleRate);
				if (hz !== null) got.push(hz);

				frame = requestAnimationFrame(tick);
			};

			stopRef.current = () => {
				cancelAnimationFrame(frame);
				resolve(got);
			};
			frame = requestAnimationFrame(tick);
		});
	}

	async function takeBaseline() {
		setError(null);
		try {
			const analyser = await openMic();
			setStage('base');
			const hz = await listen(analyser, BASE_MS);
			const b = baselineOf(hz);

			if (b === null) {
				setStage('idle');
				setError('소리를 못 들었어요. 마이크 가까이에서 "아—" 하고 길게 내주세요.');
				return;
			}
			setBase(b);
			setStage('ready');
		} catch {
			setStage('idle');
			setError('마이크를 쓸 수 없습니다. 브라우저가 물어보는 마이크 허용을 눌러주세요.');
		}
	}

	async function say() {
		if (base === null) return;
		setError(null);
		setGuess(null);
		try {
			const analyser = await openMic();
			setStage('listening');
			const hz = await listen(analyser, SAY_MS);

			if (hz.length < 8) {
				setStage('ready');
				setError('소리를 못 들었어요. 조금 크게, 한 박자 길게 내주세요.');
				return;
			}

			const g = judgeTone(hz.map((h) => toSemitones(h, base)));
			setGuess(g);
			setStage('judged');
			onDone?.(g.tone === tone);
		} catch {
			setStage('ready');
			setError('마이크를 쓸 수 없습니다.');
		}
	}

	/* ── 화면 ── */

	return (
		<div className="flex flex-col gap-4">
			{/* 무엇을 말해야 하는지 */}
			<div className="flex flex-col items-center gap-2 rounded-2xl border border-rule-soft bg-paper-2/60 px-5 py-6">
				<p className="han text-6xl leading-none">{hanzi}</p>
				<p className="pinyin text-xl text-accent">{pinyin}</p>
				<p className="text-sm text-muted">{TONE_HINT[tone]}</p>
			</div>

			{/* 1단계 · 내 목소리 높이 잡기 */}
			{(stage === 'idle' || stage === 'base') && (
				<div className="flex flex-col gap-3">
					<p className="rounded-xl bg-paper-2 px-4 py-3 text-sm text-ink-2">
						먼저 <b>내 목소리 높이</b>를 알려주세요. 사람마다 목소리가 높고 낮아서, 성조는
						<b> 내 평소 높이에서 얼마나 오르내렸나</b>로 봅니다.
					</p>
					<button
						onClick={takeBaseline}
						disabled={stage === 'base'}
						className="rounded-xl bg-accent px-5 py-4 text-base font-bold text-paper disabled:opacity-60"
					>
						{stage === 'base' ? '듣는 중... "아—" 하고 계세요' : '🎤 "아—" 하고 3초 내기'}
					</button>
					{stage === 'base' && <Level level={level} />}
				</div>
			)}

			{/* 2단계 · 말해보기 */}
			{(stage === 'ready' || stage === 'listening' || stage === 'judged') && (
				<div className="flex flex-col gap-3">
					{guess && <Result guess={guess} want={tone} />}

					<button
						onClick={say}
						disabled={stage === 'listening'}
						className="rounded-xl bg-accent px-5 py-4 text-base font-bold text-paper disabled:opacity-60"
					>
						{stage === 'listening'
							? '듣는 중... 지금 말하세요'
							: guess
								? '🎤 다시 말해보기'
								: `🎤 ${TONE_LABEL[tone]}으로 말해보기`}
					</button>

					{stage === 'listening' && <Level level={level} />}

					{base !== null && stage !== 'listening' && (
						<button
							onClick={() => {
								setBase(null);
								setGuess(null);
								setStage('idle');
							}}
							className="self-center text-xs text-muted underline underline-offset-4"
						>
							내 목소리 높이 다시 잡기 ({Math.round(base)}Hz)
						</button>
					)}
				</div>
			)}

			{error && (
				<p className="rounded-xl border-l-[3px] border-warn bg-warn-soft px-4 py-3 text-sm text-ink-2">
					{error}
				</p>
			)}

			<p className="text-center text-xs text-muted">
				조용한 곳에서 하셔야 잘 됩니다. 성조만 봅니다 — 발음이 정확한지까지는 안 봐요.
			</p>
		</div>
	);
}

/** 지금 들어오는 소리 크기. 마이크가 살아 있다는 걸 눈으로 알려줍니다 */
function Level({ level }: { level: number }) {
	return (
		<div className="h-1.5 overflow-hidden rounded-full bg-rule-soft">
			<div
				className="h-full rounded-full bg-accent transition-[width] duration-75"
				style={{ width: `${Math.round(level * 100)}%` }}
			/>
		</div>
	);
}

/** 판정 결과 + 내 목소리가 그린 선 */
function Result({ guess, want }: { guess: ToneGuess; want: SpokenTone }) {
	const correct = guess.tone === want;

	return (
		<div
			className={`flex flex-col gap-3 rounded-2xl border-l-[3px] px-4 py-4 ${
				correct ? 'border-accent bg-paper-2' : 'border-warn bg-warn-soft'
			}`}
		>
			<p className="text-base font-bold">
				{correct ? '좋아요, 그 소리예요' : '아쉬워요'}
				<span className="ml-2 text-sm font-normal text-muted">
					{guess.tone === null
						? guess.why
						: correct
							? guess.why
							: `${TONE_LABEL[guess.tone]}처럼 들렸어요 — ${guess.why}`}
				</span>
			</p>

			<Curve curve={guess.curve} />

			{!correct && (
				<p className="text-sm text-ink-2">
					<b>{TONE_LABEL[want]}</b>은 {TONE_HINT[want]}
				</p>
			)}
		</div>
	);
}

/**
 * 내 목소리가 그린 선.
 *
 * 숫자로 "3성입니다" 라고만 하면 뭘 고쳐야 할지 모릅니다.
 * 모양을 보면 "아, 끝을 안 올렸구나" 가 바로 보입니다.
 */
function Curve({ curve }: { curve: number[] }) {
	if (curve.length < 2) return null;

	const W = 240;
	const H = 64;
	const top = Math.max(...curve, 2);
	const bottom = Math.min(...curve, -2);
	const span = Math.max(top - bottom, 4);

	const points = curve
		.map((v, i) => {
			const x = (i / (curve.length - 1)) * W;
			const y = H - ((v - bottom) / span) * H;
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(' ');

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="h-16 w-full"
			role="img"
			aria-label="내 목소리의 높낮이"
		>
			{/* 내 평소 높이 자리 */}
			<line
				x1="0"
				y1={H - ((0 - bottom) / span) * H}
				x2={W}
				y2={H - ((0 - bottom) / span) * H}
				stroke="currentColor"
				strokeWidth="1"
				strokeDasharray="4 4"
				className="text-muted opacity-40"
			/>
			<polyline
				points={points}
				fill="none"
				stroke="currentColor"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
				className="text-accent"
			/>
		</svg>
	);
}
