'use client';

// 소리내어 읽은 것을 글자로 받아 적고, 맞게 읽었는지 견줍니다.
//
// 브라우저에 이미 있는 음성 인식(SpeechRecognition)을 씁니다.
//
// ★ 이 기능은 되는 곳과 안 되는 곳이 뚜렷합니다.
//   · 크롬 계열은 됩니다. 파이어폭스는 아예 없습니다
//   · 인터넷 연결이 필요합니다 (기기 안에서 처리하지 않고 서버로 보냅니다)
//   그래서 10번(읽어주기)과 똑같이, 안 되면 버튼을 아예 숨깁니다.

import { useEffect, useState } from 'react';

/* 브라우저마다 이름이 다릅니다. 타입도 브라우저마다 달라서 필요한 만큼만 적어둡니다. */
type Recognition = {
	lang: string;
	continuous: boolean;
	interimResults: boolean;
	maxAlternatives: number;
	start(): void;
	stop(): void;
	abort(): void;
	onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
	onerror: ((e: { error: string }) => void) | null;
	onend: (() => void) | null;
};

type RecognitionMaker = new () => Recognition;

function maker(): RecognitionMaker | null {
	if (typeof window === 'undefined') return null;
	const w = window as unknown as {
		SpeechRecognition?: RecognitionMaker;
		webkitSpeechRecognition?: RecognitionMaker;
	};
	return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** 이 브라우저가 중국어를 받아 적을 수 있나 */
export function useCanListen(): boolean {
	const [can, setCan] = useState(false);
	// 서버에서 그릴 때와 브라우저에서 그릴 때가 달라지면 안 되므로,
	// 화면이 붙은 뒤에 봅니다.
	useEffect(() => setCan(maker() !== null), []);
	return can;
}

/** 받아 적기가 왜 안 됐는지를 알아들을 수 있는 말로 */
const WHY: Record<string, string> = {
	'no-speech': '소리를 못 들었어요. 조금 크게 읽어주세요.',
	'audio-capture': '마이크를 못 찾았어요.',
	'not-allowed': '마이크를 못 쓰게 되어 있어요. 브라우저에서 허용해주세요.',
	network: '인터넷이 필요한 기능이에요. 연결을 확인해주세요.',
	aborted: '중간에 멈췄어요.',
};

/**
 * 한 번 듣고 받아 적습니다.
 *
 * 오래 열어두지 않습니다. 한 문장 읽는 동안만 듣고 닫습니다 —
 * 계속 켜두면 옆 사람 말까지 들어옵니다.
 */
export function listenOnce(): Promise<string> {
	return new Promise((resolve, reject) => {
		const Make = maker();
		if (!Make) {
			reject(new Error('이 브라우저는 음성 인식을 지원하지 않습니다.'));
			return;
		}

		const rec = new Make();
		rec.lang = 'zh-CN'; // 간체자 본토 표준어
		rec.continuous = false;
		rec.interimResults = false;
		rec.maxAlternatives = 1;

		let got: string | null = null;

		rec.onresult = (e) => {
			got = e.results[0]?.[0]?.transcript ?? '';
		};
		rec.onerror = (e) => {
			reject(new Error(WHY[e.error] ?? `듣지 못했습니다 (${e.error})`));
		};
		rec.onend = () => {
			// 에러로 이미 끝났으면 여기서 아무것도 하지 않습니다 (약속은 한 번만 지켜집니다)
			if (got !== null) resolve(got);
			else reject(new Error('소리를 못 들었어요. 조금 크게 읽어주세요.'));
		};

		try {
			rec.start();
		} catch {
			reject(new Error('마이크를 열지 못했습니다.'));
		}
	});
}

/* ── 맞게 읽었는지 견주기 ──────────────────────────────────── */

/** 견주기 전에 문장부호와 띄어쓰기를 떼어냅니다. 읽을 때 소리 나지 않는 것들입니다 */
function onlyHanzi(s: string): string[] {
	return [...s].filter((ch) => /[一-鿿]/.test(ch));
}

export type ReadResult = {
	/** 받아 적힌 그대로 */
	heard: string;
	/** 글자마다 맞았는지. 원문 순서입니다 */
	marks: { ch: string; hit: boolean }[];
	/** 맞은 글자 수 */
	hit: number;
	/** 원문 글자 수 */
	total: number;
};

/**
 * 읽은 것과 원문을 글자 단위로 견줍니다.
 *
 * ★ 통째로 같은지만 보면 쓸모가 없습니다.
 *   한 글자 잘못 읽어도 "틀렸습니다" 만 나오면 어디를 고칠지 모릅니다.
 *   그래서 순서를 지키면서 겹치는 글자를 찾아, 어느 글자를 놓쳤는지 짚어줍니다.
 *
 * ★ 받아 적기는 완벽하지 않습니다.
 *   비슷한 소리를 다른 글자로 적는 일이 흔합니다. 그래서 점수를 매기되
 *   "몇 글자 맞았나" 로만 말하고, 틀렸다고 단정하지 않습니다.
 *
 * 순서를 지키며 가장 많이 겹치는 부분을 찾는 방법(LCS)을 씁니다.
 */
export function compareReading(said: string, target: string): ReadResult {
	const a = onlyHanzi(target);
	const b = onlyHanzi(said);

	// 표를 채워가며 "여기까지 몇 글자를 순서대로 맞췄나" 를 셉니다
	const table: number[][] = Array.from({ length: a.length + 1 }, () =>
		new Array<number>(b.length + 1).fill(0),
	);
	for (let i = 1; i <= a.length; i++) {
		for (let j = 1; j <= b.length; j++) {
			table[i][j] =
				a[i - 1] === b[j - 1]
					? table[i - 1][j - 1] + 1
					: Math.max(table[i - 1][j], table[i][j - 1]);
		}
	}

	// 표를 거꾸로 되짚어 어느 글자가 맞았는지 표시합니다
	const marks: { ch: string; hit: boolean }[] = a.map((ch) => ({ ch, hit: false }));
	let i = a.length;
	let j = b.length;
	while (i > 0 && j > 0) {
		if (a[i - 1] === b[j - 1]) {
			marks[i - 1].hit = true;
			i--;
			j--;
		} else if (table[i - 1][j] >= table[i][j - 1]) {
			i--;
		} else {
			j--;
		}
	}

	return {
		heard: said,
		marks,
		hit: marks.filter((m) => m.hit).length,
		total: a.length,
	};
}
