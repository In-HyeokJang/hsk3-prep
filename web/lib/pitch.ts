// 목소리의 높낮이를 재고, 그 모양이 몇 성인지 가려냅니다.
//
// 화면도 마이크도 여기에 없습니다. 숫자만 다룹니다.
// 그래야 이 규칙만 따로 시험해볼 수 있습니다 — 마이크에 대고 백 번 말해보는 대신
// 가짜 곡선을 만들어 넣어보면 되니까요.
//
// ★ 성조는 절대 음높이가 아니라 상대적인 곡선입니다.
//   낮은 목소리의 1성이 높은 목소리의 3성보다 낮습니다.
//   그래서 "몇 헤르츠인가" 가 아니라 "내 평소 높이에서 얼마나 오르내렸나" 를 봅니다.
//   단위는 반음(semitone) 입니다. 12반음이 한 옥타브고, 사람 귀가 느끼는 간격과 맞습니다.

/** 이 화면에서 소리로 가려내는 성조. 경성은 뺍니다 — 높낮이가 아니라 앞 글자에 딸려 정해집니다 */
export type SpokenTone = 1 | 2 | 3 | 4;

/** 사람 목소리로 볼 수 있는 범위 (헤르츠). 이 밖은 잡음으로 봅니다 */
const LOW_HZ = 65;
const HIGH_HZ = 500;

/**
 * 소리 조각 하나에서 음높이를 잽니다. 못 잡으면 null 입니다.
 *
 * 소리를 조금씩 밀어가며 자기 자신과 겹쳐봅니다.
 * 제일 잘 겹치는 밀린 거리가 한 주기이고, 초당 몇 주기인가가 곧 음높이입니다.
 *
 * ★ 여기에 함정이 하나 있습니다 — 옥타브를 잘못 잡는 것.
 *   사람 목소리에는 배음이 섞여 있어서, 두 주기·세 주기를 밀어도 잘 겹칩니다.
 *   "제일 잘 겹치는 곳" 을 그냥 고르면 실제보다 한 옥타브 낮게(또는 3분의 1로)
 *   잡히는 일이 생깁니다. 실제로 220Hz 를 73Hz 로 읽었습니다.
 *
 *   그래서 두 가지를 합니다.
 *     · 겹침 정도를 소리 크기로 나눠서 잽니다 (0~1). 긴 거리라고 유리해지지 않게요
 *     · 제일 큰 봉우리가 아니라, 그것과 거의 같은 높이의 **첫 번째** 봉우리를 고릅니다.
 *       진짜 주기는 늘 제일 앞에 있습니다. 뒤의 것들은 그 배수입니다
 *
 * 사람 목소리 범위 밖은 아예 안 봅니다. 계산도 줄고 잡음도 덜 걸립니다.
 */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
	const n = buf.length;

	// 너무 조용하면 포기합니다. 숨소리에서 음높이를 읽어봐야 아무 뜻이 없습니다.
	let power = 0;
	for (let i = 0; i < n; i++) power += buf[i] * buf[i];
	if (Math.sqrt(power / n) < 0.012) return null;

	const minLag = Math.floor(sampleRate / HIGH_HZ);
	const maxLag = Math.min(Math.floor(sampleRate / LOW_HZ), n - 1);
	if (maxLag <= minLag) return null;

	// 거리마다 "얼마나 잘 겹치나" 를 0~1 로 잽니다.
	const fit = new Float32Array(maxLag + 2);
	for (let lag = minLag; lag <= maxLag; lag++) {
		let overlap = 0;
		let size = 0;
		for (let i = 0; i < n - lag; i++) {
			overlap += buf[i] * buf[i + lag];
			size += buf[i] * buf[i] + buf[i + lag] * buf[i + lag];
		}
		fit[lag] = size > 0 ? (2 * overlap) / size : 0;
	}

	let peak = 0;
	for (let lag = minLag; lag <= maxLag; lag++) if (fit[lag] > peak) peak = fit[lag];

	// 어디를 밀어봐도 잘 안 겹치면 목소리가 아니라 잡음입니다
	if (peak < 0.45) return null;

	// 거의 같은 높이의 첫 봉우리. 그게 진짜 주기입니다.
	const enough = peak * 0.9;
	let bestLag = -1;
	for (let lag = minLag + 1; lag < maxLag; lag++) {
		if (fit[lag] >= enough && fit[lag] >= fit[lag - 1] && fit[lag] >= fit[lag + 1]) {
			bestLag = lag;
			break;
		}
	}
	if (bestLag < 0) return null;

	// 봉우리 양옆을 보고 소수점까지 다듬습니다. 안 하면 높은 소리에서 계단처럼 튑니다.
	const y1 = fit[bestLag - 1];
	const y2 = fit[bestLag];
	const y3 = fit[bestLag + 1];
	const bend = y1 + y3 - 2 * y2;
	const lag = bend < 0 ? bestLag + (y1 - y3) / (2 * bend) : bestLag;

	const hz = sampleRate / lag;
	if (hz < LOW_HZ || hz > HIGH_HZ) return null;
	return hz;
}

/**
 * 헤르츠를 반음으로 바꿉니다. 기준 높이보다 얼마나 위인지입니다.
 * 12가 한 옥타브 위, -12가 한 옥타브 아래입니다.
 */
export function toSemitones(hz: number, baseHz: number): number {
	return 12 * Math.log2(hz / baseHz);
}

/**
 * 기준 높이를 정합니다 ("아—" 하고 낸 소리들에서).
 *
 * 평균이 아니라 가운뎃값을 씁니다. 시작과 끝에 섞이는 헛소리 한두 개가
 * 평균은 통째로 끌고 가지만 가운뎃값은 못 건드립니다.
 */
export function baselineOf(hzList: number[]): number | null {
	const clean = hzList.filter((h) => h >= LOW_HZ && h <= HIGH_HZ);
	if (clean.length < 5) return null;
	return median(clean);
}

function median(xs: number[]): number {
	const sorted = [...xs].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 곡선을 다듬습니다.
 *
 * 음높이는 한 점씩 튀는 일이 잦습니다 (숨소리·잡음·측정 실수).
 * 가운뎃값으로 훑으면 튄 점만 사라지고 오르내리는 모양은 그대로 남습니다.
 * 평균으로 훑으면 튄 점이 주위까지 물들입니다.
 */
export function smooth(curve: number[], window = 5): number[] {
	if (curve.length <= window) return [...curve];
	const half = Math.floor(window / 2);

	return curve.map((_, i) => {
		const from = Math.max(0, i - half);
		const to = Math.min(curve.length, i + half + 1);
		return median(curve.slice(from, to));
	});
}

/** 가려낸 결과 */
export type ToneGuess = {
	/** 못 알아들었으면 null */
	tone: SpokenTone | null;
	/** 다듬은 곡선 (반음). 화면에 그림으로 보여줍니다 */
	curve: number[];
	/** 왜 그렇게 봤는지 한 줄 */
	why: string;
};

/**
 * 곡선의 모양으로 성조를 가려냅니다.
 *
 *   1성  ─────   평평하게 높이 유지
 *   2성  ╱       아래에서 위로 올라감
 *   3성  ╲╱      내려갔다가 다시 올라옴
 *   4성  ╲       위에서 아래로 뚝 떨어짐
 *
 * 3성을 먼저 봅니다. 3성은 앞부분만 보면 4성처럼 내려가고
 * 뒷부분만 보면 2성처럼 올라가서, 나중에 보면 늘 다른 것에 먼저 걸립니다.
 *
 * 숫자(1.5반음 · 2.0 · 2.5)는 사람이 실제로 내는 폭에서 잡았습니다.
 * 너무 빡빡하면 맞게 말해도 계속 틀렸다고 하고, 너무 헐거우면
 * 아무렇게나 말해도 다 맞다고 해서 연습이 안 됩니다.
 */
export function judgeTone(raw: number[]): ToneGuess {
	const curve = smooth(raw);

	if (curve.length < 8) {
		return { tone: null, curve, why: '소리가 너무 짧아요. 한 박자 길게 내주세요' };
	}

	const slice = (from: number, to: number) => {
		const a = Math.floor(curve.length * from);
		const b = Math.max(Math.floor(curve.length * to), a + 1);
		return curve.slice(a, b);
	};

	const head = median(slice(0, 0.3)); // 시작 높이
	const tail = median(slice(0.7, 1)); // 끝 높이
	const lowest = Math.min(...curve);
	const highest = Math.max(...curve);
	const lowAt = curve.indexOf(lowest) / (curve.length - 1);

	const slope = tail - head; // 올라갔나 내려갔나
	const range = highest - lowest; // 얼마나 오르내렸나

	// 3성 — 가운데가 푹 꺼졌나
	if (lowAt > 0.15 && lowAt < 0.85 && head - lowest >= 1.5 && tail - lowest >= 1.5) {
		return { tone: 3, curve, why: '내려갔다가 다시 올라왔어요' };
	}

	// 4성 — 뚝 떨어졌나
	if (slope <= -2.5) {
		return { tone: 4, curve, why: '위에서 아래로 떨어졌어요' };
	}

	// 2성 — 올라갔나
	if (slope >= 2.0) {
		return { tone: 2, curve, why: '아래에서 위로 올라갔어요' };
	}

	// 1성 — 평평한가
	if (Math.abs(slope) < 1.5 && range < 3.5) {
		return { tone: 1, curve, why: '높이가 거의 그대로예요' };
	}

	// 어느 쪽도 뚜렷하지 않으면 그나마 가까운 것으로 봅니다.
	// "모르겠어요" 로 돌려주면 뭘 고쳐야 할지 알 수 없습니다.
	if (slope < 0) return { tone: 4, curve, why: '조금 내려갔어요. 4성이라면 더 뚝 떨어뜨려 보세요' };
	if (slope > 0) return { tone: 2, curve, why: '조금 올라갔어요. 2성이라면 더 확실히 올려 보세요' };
	return { tone: 1, curve, why: '거의 평평해요' };
}

/** 성조마다 어떻게 내는지 한 줄. 틀렸을 때 이걸 보여줍니다 */
export const TONE_HINT: Record<SpokenTone, string> = {
	1: '높은 자리에서 평평하게 — 노래의 한 음을 길게 끄는 느낌',
	2: '아래에서 위로 쭉 올려 — "뭐?" 하고 되물을 때처럼',
	3: '내렸다가 다시 올려 — 낮게 눌렀다 살짝 띄웁니다',
	4: '위에서 아래로 뚝 — "야!" 하고 부를 때처럼',
};
