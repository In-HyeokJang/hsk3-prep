// 한자를 손으로 쓴 것을 채점하는 규칙.
//
// 화면을 그리지 않습니다. lib/quiz.ts 와 같은 자리입니다 —
// "무엇이 맞는가" 만 정하고, 어떻게 보여줄지는 화면이 정합니다.

/* ── 모양 ──────────────────────────────────────────────────── */

export type Point = { x: number; y: number };

/** 획 하나. 붓을 대고 뗄 때까지의 점들 */
export type Stroke = Point[];

/** 한 글자의 정답 획. 좌표는 0~1 로 맞춰둡니다 (왼쪽 위가 0,0) */
export type CharStrokes = {
	hanzi: string;
	medians: Stroke[];
};

export type Judgement = {
	ok: boolean;
	/** 0~100 */
	score: number;
	got: number; //  내가 쓴 획 수
	want: number; // 정답 획 수
	reason: string; // 사람이 읽을 한 줄
};

/* ── 정답 획 가져오기 ──────────────────────────────────────── */

// 글자 하나에 1KB 정도입니다. 필요할 때 한 글자씩 받아옵니다.
const CDN = 'https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1';

// 같은 글자를 두 번 받지 않도록 담아둡니다.
// null 은 "찾아봤는데 없더라" 는 뜻입니다 — 없는 글자를 매번 다시 찾지 않게요.
const memo = new Map<string, CharStrokes | null>();

/**
 * 이 자료의 y 축은 위로 갑니다. 화면은 아래로 갑니다.
 *
 * 三 을 확인해보면 처음 쓰는 획(맨 위 가로줄)의 y 가 660 이고
 * 마지막 획(맨 아래 가로줄)이 170 입니다. 그대로 그리면 글자가 뒤집힙니다.
 * 세로 범위는 -124 ~ 900 이라서 900 에서 빼면 0~1024 안에 들어옵니다.
 */
function toScreen(raw: [number, number]): Point {
	return { x: raw[0] / 1024, y: (900 - raw[1]) / 1024 };
}

function cacheKey(hanzi: string) {
	return `hanzi-strokes:${hanzi}`;
}

/** 정답 획을 가져옵니다. 없는 글자면 null 입니다 (채점을 건너뛰라는 뜻) */
export async function loadStrokes(hanzi: string): Promise<CharStrokes | null> {
	if (memo.has(hanzi)) return memo.get(hanzi)!;

	// 한 번 받은 글자는 브라우저에 남겨둡니다. 지하철에서도 다시 쓸 수 있게요.
	try {
		const saved = localStorage.getItem(cacheKey(hanzi));
		if (saved) {
			const parsed = JSON.parse(saved) as CharStrokes;
			memo.set(hanzi, parsed);
			return parsed;
		}
	} catch {
		// 저장 공간이 막혀 있어도 그냥 받아오면 됩니다
	}

	try {
		const res = await fetch(`${CDN}/${encodeURIComponent(hanzi)}.json`);
		if (!res.ok) {
			memo.set(hanzi, null);
			return null;
		}
		const data = (await res.json()) as { medians: [number, number][][] };
		const parsed: CharStrokes = {
			hanzi,
			medians: data.medians.map((m) => m.map(toScreen)),
		};

		memo.set(hanzi, parsed);
		try {
			localStorage.setItem(cacheKey(hanzi), JSON.stringify(parsed));
		} catch {
			// 저장 공간이 꽉 찼어도 이번 화면에서는 잘 씁니다
		}
		return parsed;
	} catch {
		// 신호가 끊겼을 때. null 을 담아두지 않습니다 — 나중에 다시 시도해야 하니까요.
		return null;
	}
}

/* ── 채점 ──────────────────────────────────────────────────── */

const SAMPLES = 16; // 획 하나를 몇 개의 점으로 견줄지
const FAR = 0.3; //   이만큼 어긋나면 0점. 손가락으로 쓰는 것이라 넉넉히 잡았습니다
const PASS = 60; //   합격선
const MIN_LEN = 0.02; // 이보다 짧은 획은 실수로 찍힌 점으로 봅니다

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** 획의 총 길이 */
function pathLength(stroke: Stroke): number {
	let sum = 0;
	for (let i = 1; i < stroke.length; i++) sum += dist(stroke[i - 1], stroke[i]);
	return sum;
}

/**
 * 획을 일정한 간격의 점 n 개로 다시 찍습니다.
 *
 * 천천히 그으면 점이 촘촘하고 빨리 그으면 성깁니다.
 * 그대로 견주면 "얼마나 빨리 썼나" 를 채점하게 됩니다. 그래서 간격을 고릅니다.
 */
function resample(stroke: Stroke, n: number): Stroke {
	if (stroke.length === 0) return [];
	if (stroke.length === 1) return Array.from({ length: n }, () => stroke[0]);

	const total = pathLength(stroke);
	if (total === 0) return Array.from({ length: n }, () => stroke[0]);

	const step = total / (n - 1);
	const out: Stroke = [stroke[0]];
	let at = 0; //      다음에 볼 마디
	let walked = 0; //  그 마디 안에서 얼마나 왔는지

	for (let i = 1; i < n - 1; i++) {
		let need = step;
		while (at < stroke.length - 1) {
			const seg = dist(stroke[at], stroke[at + 1]);
			const left = seg - walked;
			if (left >= need) {
				walked += need;
				const t = seg === 0 ? 0 : walked / seg;
				out.push({
					x: stroke[at].x + (stroke[at + 1].x - stroke[at].x) * t,
					y: stroke[at].y + (stroke[at + 1].y - stroke[at].y) * t,
				});
				break;
			}
			need -= left;
			walked = 0;
			at++;
		}
		if (at >= stroke.length - 1) out.push(stroke[stroke.length - 1]);
	}

	out.push(stroke[stroke.length - 1]);
	return out;
}

/**
 * 글자 전체를 같은 크기·같은 자리로 맞춥니다.
 *
 * 크게 쓰든 작게 쓰든, 칸 왼쪽에 쓰든 오른쪽에 쓰든 같은 점수가 나와야 합니다.
 * 가로세로를 따로 늘이면 안 됩니다 — 一 처럼 납작한 글자가 정사각형으로 펴져서
 * 아무 글자하고나 비슷해집니다. 그래서 긴 쪽 기준으로 한 번에 줄입니다.
 */
function fit(strokes: Stroke[]): Stroke[] {
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;

	for (const s of strokes) {
		for (const p of s) {
			if (p.x < minX) minX = p.x;
			if (p.x > maxX) maxX = p.x;
			if (p.y < minY) minY = p.y;
			if (p.y > maxY) maxY = p.y;
		}
	}
	if (minX === Infinity) return strokes;

	const size = Math.max(maxX - minX, maxY - minY);
	if (size < 1e-6) {
		// 점 하나만 찍은 경우. 한가운데로 보냅니다
		return strokes.map((s) => s.map(() => ({ x: 0.5, y: 0.5 })));
	}

	const cx = (minX + maxX) / 2;
	const cy = (minY + maxY) / 2;
	return strokes.map((s) =>
		s.map((p) => ({ x: (p.x - cx) / size + 0.5, y: (p.y - cy) / size + 0.5 })),
	);
}

/**
 * 두 획이 얼마나 다른지. 0 이면 똑같습니다.
 *
 * 거꾸로 그은 것도 같은 획으로 봅니다.
 * 획순은 채점하지 않기로 했으니, 방향까지 틀렸다고 하면 이중으로 깎입니다.
 */
function strokeGap(a: Stroke, b: Stroke): number {
	let forward = 0;
	let backward = 0;
	for (let i = 0; i < a.length; i++) {
		forward += dist(a[i], b[i]);
		backward += dist(a[i], b[b.length - 1 - i]);
	}
	return Math.min(forward, backward) / a.length;
}

/**
 * 손으로 쓴 글자를 채점합니다.
 *
 * 획순은 보지 않습니다. 획 개수와 전체 모양만 봅니다.
 * 손가락으로 쓰면 삐뚤어지는 게 정상이라, 엄하게 매기면 아무것도 통과하지 못합니다.
 *
 * @param drawn 내가 쓴 획들. 좌표는 칸 안에서 0~1
 * @param answer 정답 획들 (loadStrokes 가 준 medians)
 */
export function judge(drawn: Stroke[], answer: Stroke[]): Judgement {
	// 칸을 톡 건드려서 생긴 점은 획으로 세지 않습니다
	const real = drawn.filter((s) => s.length > 1 && pathLength(s) >= MIN_LEN);

	const got = real.length;
	const want = answer.length;

	if (got === 0) {
		return { ok: false, score: 0, got, want, reason: '아직 아무것도 안 쓰셨어요' };
	}

	const mine = fit(real).map((s) => resample(s, SAMPLES));
	const theirs = fit(answer).map((s) => resample(s, SAMPLES));

	// 획순을 안 보기로 했으니, 내 획마다 가장 닮은 정답 획을 찾아 짝지어 줍니다.
	// 한 번 쓴 정답 획은 다시 쓰지 않습니다 — 안 그러면 획 하나를 여러 번 그어놓고
	// 만점을 받습니다.
	const taken = new Set<number>();
	let sum = 0;
	let pairs = 0;

	for (const m of mine) {
		let best = Infinity;
		let bestAt = -1;
		for (let i = 0; i < theirs.length; i++) {
			if (taken.has(i)) continue;
			const gap = strokeGap(m, theirs[i]);
			if (gap < best) {
				best = gap;
				bestAt = i;
			}
		}
		if (bestAt === -1) break; // 정답 획을 다 썼습니다. 남은 건 덤으로 그은 것
		taken.add(bestAt);
		sum += best;
		pairs++;
	}

	const gap = pairs > 0 ? sum / pairs : FAR;
	const shape = Math.max(0, Math.min(1, 1 - gap / FAR));

	// 획 수가 틀리면 깎습니다. 두 개 이상 틀리면 다른 글자를 쓴 것에 가깝습니다.
	const off = Math.abs(got - want);
	const score = Math.round(Math.max(0, shape - off * 0.18) * 100);
	const ok = score >= PASS && off <= 1;

	let reason: string;
	if (ok && off === 0) reason = '잘 쓰셨어요';
	else if (ok) reason = `모양은 맞아요. 획은 ${want}개예요`;
	else if (off >= 2) reason = `획이 ${want}개인데 ${got}개 쓰셨어요`;
	else if (shape < 0.35) reason = '모양이 많이 달라요';
	else reason = '조금 아쉬워요. 다시 한 번';

	return { ok, score, got, want, reason };
}
