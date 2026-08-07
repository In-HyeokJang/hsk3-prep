'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { judge, loadStrokes, type CharStrokes, type Judgement, type Point, type Stroke } from '@/lib/hanzi';
import { ACTIVE_AREA, startCameraPen, type PenFrame } from '@/lib/camera-pen';

/**
 * 한자를 손으로 써보고 채점받는 칸.
 *
 * 손가락(폰) · 마우스(컴퓨터) · 애플펜슬을 모두 Pointer 하나로 받습니다.
 * 셋을 따로 만들면 채점 규칙도 세 벌이 됩니다.
 * 어느 쪽으로 들어오든 좌표를 0~1 로 바꿔서 한 곳으로 모읍니다.
 *
 * 단어가 두 글자면 한 글자씩 차례로 씁니다.
 * 두 칸을 나란히 놓으면 폰에서 칸이 너무 작아 글씨를 쓸 수가 없습니다.
 */
export default function WriteBox({
	hanzi,
	onFinish,
}: {
	hanzi: string;
	/** 모든 글자를 다 쓰고 났을 때. 전부 합격이면 true */
	onFinish?: (ok: boolean) => void;
}) {
	const chars = useMemo(() => Array.from(hanzi), [hanzi]);

	const [at, setAt] = useState(0);
	const [answer, setAnswer] = useState<CharStrokes | null | undefined>(undefined); // undefined = 받는 중
	const [results, setResults] = useState<(Judgement | null)[]>(() => chars.map(() => null));
	const [showAnswer, setShowAnswer] = useState(false);
	const [paintTick, setPaintTick] = useState(0); // 다시 그리라는 신호
	const [cam, setCam] = useState<'off' | 'loading' | 'on'>('off');
	const [camError, setCamError] = useState<string | null>(null);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const strokes = useRef<Stroke[]>([]);
	const active = useRef<Stroke | null>(null);
	const stopCam = useRef<(() => void) | null>(null);
	// 글씨 색. 획을 그을 때마다 색을 다시 계산하면 느려서 담아둡니다.
	// 어두운 화면으로 바뀌면 redraw 가 새 값으로 채웁니다.
	const ink = useRef('#000');

	const result = results[at] ?? null;
	const done = results.every((r) => r !== null);

	/* ── 붓 ────────────────────────────────────────────────── */

	const begin = useCallback((p: Point) => {
		active.current = [p];
		strokes.current.push(active.current);
	}, []);

	const extend = useCallback((p: Point) => {
		const s = active.current;
		if (!s) return;
		const last = s[s.length - 1];
		// 너무 촘촘한 점은 버립니다. 손을 가만히 둬도 좌표는 계속 떨려서
		// 그대로 담으면 점이 수천 개가 되고 채점이 느려집니다.
		if (Math.hypot(p.x - last.x, p.y - last.y) < 0.004) return;
		s.push(p);

		// 점이 하나 늘 때마다 React 를 다시 그리면 폰에서 글씨가 뚝뚝 끊깁니다.
		// 손을 떼기 전까지는 늘어난 마디만 캔버스에 곧바로 잇고,
		// 부드러운 곡선으로 다듬는 건 손을 뗄 때 한 번만 합니다.
		const cv = canvasRef.current;
		const ctx = cv?.getContext('2d');
		if (!cv || !ctx) return;
		ctx.save();
		ctx.strokeStyle = ink.current;
		ctx.lineWidth = cv.width * 0.038;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.beginPath();
		ctx.moveTo(last.x * cv.width, last.y * cv.height);
		ctx.lineTo(p.x * cv.width, p.y * cv.height);
		ctx.stroke();
		ctx.restore();
	}, []);

	const finish = useCallback(() => {
		if (!active.current) return;
		active.current = null;
		setPaintTick((t) => t + 1);
	}, []);

	/* ── 그리기 ────────────────────────────────────────────── */

	const redraw = useCallback(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;

		const w = cv.width;
		const h = cv.height;
		ctx.clearRect(0, 0, w, h);

		const css = getComputedStyle(document.documentElement);
		const tint = (name: string) => css.getPropertyValue(name).trim() || '#000';
		ink.current = tint('--color-ink');

		// 정답 획을 뒤에 깔아줍니다. 어디가 어긋났는지 눈으로 봐야 다음에 고칩니다.
		if (showAnswer && answer) {
			paint(ctx, answer.medians, w, h, tint('--color-accent'), w * 0.055, 0.3);
		}
		paint(ctx, strokes.current, w, h, ink.current, w * 0.038, 1);
	}, [answer, showAnswer]);

	// 캔버스 크기를 화면 크기에 맞춥니다.
	// 이걸 안 하면 폰의 고해상도 화면에서 글씨가 뭉개져 보입니다.
	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;

		const fit = () => {
			const box = cv.getBoundingClientRect();
			if (box.width === 0) return;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);
			cv.width = Math.round(box.width * dpr);
			cv.height = Math.round(box.height * dpr);
			setPaintTick((t) => t + 1); // 크기를 바꾸면 캔버스가 지워집니다
		};

		fit();
		const watch = new ResizeObserver(fit);
		watch.observe(cv);
		return () => watch.disconnect();
	}, []);

	useEffect(() => {
		redraw();
	}, [redraw, paintTick]);

	/* ── 글자가 바뀌면 ─────────────────────────────────────── */

	useEffect(() => {
		setResults(chars.map(() => null));
		setAt(0);
	}, [chars]);

	useEffect(() => {
		let cancelled = false;
		setAnswer(undefined);
		loadStrokes(chars[at] ?? '').then((a) => {
			if (!cancelled) setAnswer(a);
		});
		return () => {
			cancelled = true;
		};
	}, [chars, at]);

	useEffect(() => {
		strokes.current = [];
		active.current = null;
		setShowAnswer(false);
		setPaintTick((t) => t + 1);
	}, [at]);

	/* ── 카메라 ────────────────────────────────────────────── */

	// 카메라가 부르는 함수는 한 번 넘기면 바뀌지 않습니다.
	// 그래서 최신 상태를 보려면 이렇게 담아둬야 합니다.
	const onPen = (f: PenFrame) => {
		if (result) return; // 채점이 끝난 칸에는 못 씁니다
		if (!f.point || !f.drawing) {
			finish();
			return;
		}
		if (!active.current) begin(f.point);
		else extend(f.point);
	};
	const onPenRef = useRef(onPen);
	onPenRef.current = onPen;

	async function toggleCam() {
		if (cam !== 'off') {
			stopCam.current?.();
			stopCam.current = null;
			setCam('off');
			return;
		}
		setCam('loading');
		setCamError(null);
		try {
			stopCam.current = await startCameraPen(videoRef.current!, (f) => onPenRef.current(f));
			setCam('on');
		} catch (e) {
			setCamError(e instanceof Error ? e.message : String(e));
			setCam('off');
		}
	}

	// 화면을 떠날 때 카메라를 끕니다. 안 그러면 카메라 불이 계속 켜져 있습니다.
	useEffect(() => {
		return () => {
			stopCam.current?.();
			stopCam.current = null;
		};
	}, []);

	/* ── 버튼 ──────────────────────────────────────────────── */

	function clear() {
		strokes.current = [];
		active.current = null;
		setResults((rs) => {
			const next = [...rs];
			next[at] = null;
			return next;
		});
		setShowAnswer(false);
		setPaintTick((t) => t + 1);
	}

	function undo() {
		if (result) return;
		strokes.current.pop();
		setPaintTick((t) => t + 1);
	}

	function check() {
		if (!answer) return;
		const verdict = judge(strokes.current, answer.medians);
		setResults((rs) => {
			const next = [...rs];
			next[at] = verdict;
			return next;
		});
		if (!verdict.ok) setShowAnswer(true);
	}

	function goNext() {
		if (at + 1 < chars.length) {
			setAt(at + 1);
			return;
		}
		onFinish?.(results.every((r) => r?.ok === true));
	}

	const strokeCount = strokes.current.length;

	return (
		<section className="flex flex-col gap-4">
			{/* ── 어느 글자를 쓰는 중인지 ── */}
			<div className="flex items-center justify-between">
				<p className="text-xs font-semibold tracking-wide text-muted">손으로 써보기</p>
				{chars.length > 1 && (
					<div className="flex items-center gap-1.5">
						{chars.map((c, i) => {
							const r = results[i];
							return (
								<span
									key={i}
									className={`han flex size-7 items-center justify-center rounded-md text-sm ${
										i === at
											? 'bg-accent text-paper'
											: r?.ok
												? 'bg-accent-soft text-accent'
												: r
													? 'bg-warn-soft text-warn'
													: 'bg-rule-soft text-muted'
									}`}
								>
									{c}
								</span>
							);
						})}
					</div>
				)}
			</div>

			{/* ── 쓰는 칸 ── */}
			<div className="relative mx-auto w-full max-w-[19rem]">
				<div className="relative aspect-square border-[1.5px] border-rule bg-paper-2/50">
					{/* 한자 연습장의 점선 십자 */}
					<span
						aria-hidden
						className="pointer-events-none absolute inset-x-0 top-1/2 h-px"
						style={{
							backgroundImage:
								'repeating-linear-gradient(to right, var(--color-rule) 0 6px, transparent 6px 12px)',
						}}
					/>
					<span
						aria-hidden
						className="pointer-events-none absolute inset-y-0 left-1/2 w-px"
						style={{
							backgroundImage:
								'repeating-linear-gradient(to bottom, var(--color-rule) 0 6px, transparent 6px 12px)',
						}}
					/>

					{/* touch-none 이 없으면 글씨를 쓰려고 손가락을 끄는 순간 화면이 스크롤됩니다.
					    setPointerCapture 가 없으면 손가락이 칸 밖으로 나가는 순간 획이 끊깁니다. */}
					<canvas
						ref={canvasRef}
						className="absolute inset-0 size-full touch-none"
						style={{ cursor: result ? 'default' : 'crosshair' }}
						onPointerDown={(e) => {
							if (result || cam === 'on') return;
							e.currentTarget.setPointerCapture(e.pointerId);
							begin(spot(e));
						}}
						onPointerMove={(e) => {
							if (result || cam === 'on') return;
							if (!active.current) return;
							extend(spot(e));
						}}
						onPointerUp={finish}
						onPointerCancel={finish}
					/>

					{/* 카메라 미리보기.
					    꺼져 있을 때도 자리에 남겨둡니다 — 화면에서 빼버리면 켤 때
					    비디오 칸이 아직 없어서 카메라를 붙일 데가 없습니다. */}
					<div
						className={`absolute right-2 top-2 w-24 overflow-hidden rounded-lg border border-rule bg-black transition-opacity md:w-28 ${
							cam === 'off' ? 'pointer-events-none opacity-0' : 'opacity-100'
						}`}
					>
						<video ref={videoRef} muted playsInline className="block w-full -scale-x-100" />
						<span
							aria-hidden
							className="pointer-events-none absolute border border-dashed border-white/70"
							style={{
								left: `${ACTIVE_AREA.x0 * 100}%`,
								top: `${ACTIVE_AREA.y0 * 100}%`,
								width: `${(ACTIVE_AREA.x1 - ACTIVE_AREA.x0) * 100}%`,
								height: `${(ACTIVE_AREA.y1 - ACTIVE_AREA.y0) * 100}%`,
							}}
						/>
					</div>

					{answer === undefined && (
						<p className="absolute inset-0 grid place-items-center text-sm text-muted">
							획 자료를 받는 중...
						</p>
					)}
				</div>

				{cam === 'on' && (
					<p className="mt-2 text-center text-xs text-muted">
						☝️ 검지만 펴면 써지고, ✌️ 브이를 하면 붓이 떨어집니다
					</p>
				)}
			</div>

			{/* ── 채점 못 하는 글자 ── */}
			{answer === null && (
				<p className="rounded-xl bg-paper-2 px-4 py-3 text-sm text-muted">
					이 글자는 획 자료가 없어서 채점하지 못합니다. 연습만 해보세요.
				</p>
			)}

			{/* ── 결과 ── */}
			{result && (
				<div
					className={`rounded-xl border-l-[3px] px-4 py-3 ${
						result.ok ? 'border-accent bg-accent-soft' : 'border-warn bg-warn-soft'
					}`}
				>
					<p className="flex items-baseline justify-between text-base font-bold">
						<span className={result.ok ? 'text-accent' : 'text-warn'}>
							{result.ok ? '맞게 쓰셨어요' : '다시 한 번'}
						</span>
						<span className="pinyin text-sm tabular-nums text-ink-2">{result.score}점</span>
					</p>
					<p className="mt-0.5 text-sm text-ink-2">{result.reason}</p>
				</div>
			)}

			{/* ── 버튼 ── */}
			<div className="flex flex-col gap-2.5">
				{!result ? (
					<>
						<div className="grid grid-cols-2 gap-2.5">
							<button
								type="button"
								onClick={undo}
								disabled={strokeCount === 0}
								className="rounded-xl border border-rule px-4 py-3 text-sm font-semibold text-ink-2 active:bg-paper-2 disabled:opacity-40"
							>
								← 한 획 지우기
							</button>
							<button
								type="button"
								onClick={clear}
								disabled={strokeCount === 0}
								className="rounded-xl border border-rule px-4 py-3 text-sm font-semibold text-ink-2 active:bg-paper-2 disabled:opacity-40"
							>
								다 지우기
							</button>
						</div>
						<button
							type="button"
							onClick={check}
							disabled={strokeCount === 0 || !answer}
							className="rounded-xl bg-accent px-5 py-3.5 text-base font-bold text-paper transition-transform active:scale-[0.99] disabled:opacity-40"
						>
							확인
						</button>
					</>
				) : (
					<div className="grid grid-cols-2 gap-2.5">
						<button
							type="button"
							onClick={clear}
							className="rounded-xl border border-rule px-4 py-3.5 text-base font-semibold text-ink-2 active:bg-paper-2"
						>
							다시 쓰기
						</button>
						<button
							type="button"
							onClick={goNext}
							className="rounded-xl bg-accent px-4 py-3.5 text-base font-bold text-paper active:scale-[0.99]"
						>
							{at + 1 < chars.length ? '다음 글자 →' : done ? '끝내기' : '넘어가기'}
						</button>
					</div>
				)}

				<div className="flex items-center justify-center gap-4 pt-0.5">
					<button
						type="button"
						onClick={() => setShowAnswer((v) => !v)}
						disabled={!answer}
						className="text-xs font-medium text-muted underline-offset-4 hover:text-accent hover:underline disabled:opacity-40"
					>
						{showAnswer ? '정답 획 숨기기' : '정답 획 보기'}
					</button>
					<button
						type="button"
						onClick={toggleCam}
						disabled={cam === 'loading'}
						className={`text-xs font-medium underline-offset-4 hover:underline disabled:opacity-40 ${
							cam === 'on' ? 'text-accent' : 'text-muted hover:text-accent'
						}`}
					>
						{cam === 'loading'
							? '카메라 켜는 중...'
							: cam === 'on'
								? '📷 카메라 끄기'
								: '📷 카메라로 쓰기'}
					</button>
				</div>

				{camError && (
					<p className="rounded-xl border-l-[3px] border-warn bg-warn-soft px-4 py-3 text-sm text-ink-2">
						<b className="text-warn">카메라를 켜지 못했습니다.</b> {camError}
						<br />
						<span className="text-muted">
							손가락으로 칸에 쓰는 건 그대로 됩니다. 카메라는 덤이에요.
						</span>
					</p>
				)}
			</div>
		</section>
	);
}

/* ── 도우미 ────────────────────────────────────────────────── */

/** 화면 위의 손가락 자리를 칸 안의 0~1 로 바꿉니다 */
function spot(e: React.PointerEvent<HTMLCanvasElement>): Point {
	const box = e.currentTarget.getBoundingClientRect();
	return {
		x: (e.clientX - box.left) / box.width,
		y: (e.clientY - box.top) / box.height,
	};
}

/**
 * 획들을 캔버스에 그립니다.
 *
 * 점과 점을 직선으로 이으면 각져 보입니다.
 * 가운뎃점을 지나는 곡선으로 이어야 붓으로 쓴 것처럼 부드럽습니다.
 */
function paint(
	ctx: CanvasRenderingContext2D,
	list: Stroke[],
	w: number,
	h: number,
	color: string,
	width: number,
	alpha: number,
) {
	ctx.save();
	ctx.globalAlpha = alpha;
	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	ctx.lineWidth = width;
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';

	for (const s of list) {
		if (s.length === 0) continue;

		if (s.length === 1) {
			ctx.beginPath();
			ctx.arc(s[0].x * w, s[0].y * h, width / 2, 0, Math.PI * 2);
			ctx.fill();
			continue;
		}

		ctx.beginPath();
		ctx.moveTo(s[0].x * w, s[0].y * h);
		for (let i = 1; i < s.length - 1; i++) {
			const a = s[i];
			const b = s[i + 1];
			ctx.quadraticCurveTo(a.x * w, a.y * h, ((a.x + b.x) / 2) * w, ((a.y + b.y) / 2) * h);
		}
		const last = s[s.length - 1];
		ctx.lineTo(last.x * w, last.y * h);
		ctx.stroke();
	}

	ctx.restore();
}
