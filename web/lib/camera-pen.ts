// 웹캠으로 손가락 끝을 따라가는 펜.
//
// 손 인식은 구글이 만든 MediaPipe 를 씁니다. 설치하지 않고 필요할 때 받아옵니다 —
// 7MB 짜리라서, 카메라를 켜지 않는 사람에게까지 내려보내면 안 됩니다.
//
// ⚠ 이건 덤입니다. 단어 600개를 팔 들고 허공에 쓰면 팔이 버티지 못합니다.
//   평소에는 손가락으로 화면을 만져서 씁니다.

const VISION = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL =
	'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

/**
 * 카메라 화면 중에서 쓰기 칸으로 쓸 자리.
 *
 * 화면 전체를 칸에 대응시키면 팔을 크게 휘둘러야 해서 글씨가 안 됩니다.
 * 가운데 일부만 씁니다. 화면에도 이 자리를 네모로 그려서 보여줍니다.
 */
export const ACTIVE_AREA = { x0: 0.28, x1: 0.72, y0: 0.14, y1: 0.86 };

export type PenFrame = {
	/** 쓰기 칸 기준 0~1. 손이 안 보이면 null */
	point: { x: number; y: number } | null;
	/** 지금 획을 긋는 중인지 (검지만 폈을 때) */
	drawing: boolean;
};

type Landmark = { x: number; y: number; z: number };

/**
 * MediaPipe 손 인식기 중 우리가 실제로 쓰는 부분만 적어둡니다.
 * 인터넷에서 받아오는 것이라 타입이 딸려오지 않습니다.
 */
type Landmarker = {
	detectForVideo: (video: HTMLVideoElement, at: number) => { landmarks?: Landmark[][] };
	close: () => void;
};

/* ── 손떨림 줄이기 ─────────────────────────────────────────── */

/**
 * 천천히 움직일 때는 많이 다듬고, 빨리 움직일 때는 덜 다듬습니다.
 * 그냥 평균을 내면 손을 빨리 움직일 때 선이 뒤늦게 따라옵니다.
 */
class Smoother {
	private y: number | null = null;
	private dy = 0;
	private prev: number | null = null;
	private prevT: number | null = null;

	filter(x: number, t: number): number {
		if (this.prevT === null || this.prev === null) {
			this.prev = x;
			this.prevT = t;
			this.y = x;
			return x;
		}
		const dt = Math.max(0.001, t - this.prevT);
		const speed = Math.abs((x - this.prev) / dt);
		this.dy = 0.7 * this.dy + 0.3 * speed;

		const cutoff = 1.4 + 0.012 * this.dy;
		const tau = 1 / (2 * Math.PI * cutoff);
		const a = 1 / (1 + tau / dt);

		this.y = a * x + (1 - a) * (this.y ?? x);
		this.prev = x;
		this.prevT = t;
		return this.y;
	}

	reset() {
		this.y = null;
		this.prev = null;
		this.prevT = null;
		this.dy = 0;
	}
}

/* ── 손 모양 ───────────────────────────────────────────────── */

const gap = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * 손목(0번)에서 손끝까지가 중간 마디까지보다 멀면 편 것입니다.
 * "손끝이 마디보다 위에 있으면" 으로 재면 손을 옆으로 눕혔을 때 틀립니다.
 */
function extended(lm: Landmark[], tip: number, pip: number) {
	return gap(lm[tip], lm[0]) > gap(lm[pip], lm[0]) * 1.15;
}

/* ── 시작 ──────────────────────────────────────────────────── */

/**
 * 카메라를 켜고 손가락을 따라갑니다.
 * @returns 멈추는 함수. 화면을 떠날 때 반드시 불러야 카메라 불이 꺼집니다.
 */
export async function startCameraPen(
	video: HTMLVideoElement,
	onFrame: (f: PenFrame) => void,
): Promise<() => void> {
	const stream = await navigator.mediaDevices.getUserMedia({
		video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
		audio: false,
	});
	video.srcObject = stream;
	await video.play();

	// webpackIgnore 를 붙여야 합니다. 이걸 빼면 Next 가 이 주소를 빌드할 때
	// 찾으려 들다가 실패합니다. 인터넷 주소는 그대로 두라는 표시입니다.
	const vision = await import(/* webpackIgnore: true */ `${VISION}/vision_bundle.mjs`);

	const fileset = await vision.FilesetResolver.forVisionTasks(`${VISION}/wasm`);
	const options = (delegate: 'GPU' | 'CPU') => ({
		baseOptions: { modelAssetPath: MODEL, delegate },
		runningMode: 'VIDEO' as const,
		numHands: 1,
		minHandDetectionConfidence: 0.5,
		minHandPresenceConfidence: 0.5,
		minTrackingConfidence: 0.5,
	});

	let landmarker: Landmarker;
	try {
		landmarker = await vision.HandLandmarker.createFromOptions(fileset, options('GPU'));
	} catch {
		// 그래픽 가속이 막힌 컴퓨터에서도 돌아가게
		landmarker = await vision.HandLandmarker.createFromOptions(fileset, options('CPU'));
	}

	const sx = new Smoother();
	const sy = new Smoother();
	let raf = 0;
	let lastAt = -1;
	let stopped = false;

	function tick() {
		raf = requestAnimationFrame(tick);
		if (stopped || video.readyState < 2) return;

		// 같은 장면을 두 번 계산하지 않습니다
		if (video.currentTime === lastAt) return;
		lastAt = video.currentTime;

		const now = performance.now();
		const found = landmarker.detectForVideo(video, now);
		const hand: Landmark[] | undefined = found.landmarks?.[0];

		if (!hand) {
			sx.reset();
			sy.reset();
			onFrame({ point: null, drawing: false });
			return;
		}

		const index = extended(hand, 8, 6);
		const middle = extended(hand, 12, 10);
		// ☝️ 검지만 = 긋기, ✌️ 브이 = 붓 들기.
		// 이게 없으면 손을 든 순간부터 내릴 때까지 전부 한 획이 됩니다.
		const drawing = index && !middle;

		// 화면은 거울처럼 뒤집어 보여주므로 x 도 뒤집습니다
		const tip = hand[8];
		const mx = 1 - tip.x;

		const t = now / 1000;
		const cx = sx.filter(mx, t);
		const cy = sy.filter(tip.y, t);

		const clamp = (v: number) => Math.max(0, Math.min(1, v));
		onFrame({
			point: {
				x: clamp((cx - ACTIVE_AREA.x0) / (ACTIVE_AREA.x1 - ACTIVE_AREA.x0)),
				y: clamp((cy - ACTIVE_AREA.y0) / (ACTIVE_AREA.y1 - ACTIVE_AREA.y0)),
			},
			drawing,
		});
	}

	tick();

	return () => {
		stopped = true;
		cancelAnimationFrame(raf);
		try {
			landmarker.close();
		} catch {
			// 이미 닫혔으면 그만입니다
		}
		// 이걸 빼면 화면을 떠나도 카메라 불이 켜져 있습니다
		stream.getTracks().forEach((t) => t.stop());
		video.srcObject = null;
	};
}
