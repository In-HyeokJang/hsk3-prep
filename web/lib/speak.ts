'use client';

// 중국어로 읽어주기.
//
// 브라우저에 이미 들어 있는 기능을 씁니다 (SpeechSynthesis).
// 소리 파일을 만들지도, 새 라이브러리를 깔지도 않습니다.
//
// ★ 이 기능의 진짜 어려움은 코드가 아니라 "기기마다 다르다" 입니다.
//   한국어 윈도우에는 중국어 목소리가 없는 경우가 아주 많습니다.
//   그러면 눌러도 아무 소리가 안 납니다 — 사이트가 고장난 것처럼 보입니다.
//
//   그래서 여기서는 "읽어주기" 보다 "이 기기에서 되나" 를 먼저 답합니다.
//   안 되면 버튼을 아예 숨기고, 왜 없는지 한 줄로 알려줍니다.

import { useEffect, useState } from 'react';

/** 브라우저가 이 기능 자체를 아는가 */
function hasApi(): boolean {
	return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * 중국어 목소리를 하나 고릅니다. 없으면 null 입니다.
 *
 * 본토 표준어(zh-CN)를 먼저 찾습니다. 이 사이트는 간체자만 다루니까요.
 * 없으면 다른 중국어 목소리라도 씁니다 — 대만·홍콩 목소리도 보통화를 읽습니다.
 * 한국어나 영어 목소리로 한자를 읽히면 안 됩니다. 아예 다른 소리가 납니다.
 *
 * ★ 기기 안에 있는 목소리를 먼저 씁니다 (`localService`).
 *   크롬·엣지의 중국어 목소리 상당수는 **클라우드**입니다. 이름만 봐서는
 *   구별이 안 되는데, 인터넷이 느리면 소리가 늦게 나거나 아예 안 납니다.
 *
 *   혼자 쓸 때는 한 번 끊겨도 다시 누르면 그만입니다. 그런데 오프라인
 *   모임(`/live`)에서는 열 명이 화면을 보고 있고, 듣기 게임은 소리가 곧
 *   문제입니다. 회의실 와이파이는 대개 느립니다.
 *
 *   그래서 품질이 조금 떨어져도 **끊기지 않는 쪽**을 고릅니다.
 *   기기 안에 중국어 목소리가 하나도 없으면 그때는 클라우드라도 씁니다.
 */
export function chineseVoice(): SpeechSynthesisVoice | null {
	if (!hasApi()) return null;

	const zh = window.speechSynthesis
		.getVoices()
		.filter((v) => v.lang.toLowerCase().startsWith('zh'));
	if (zh.length === 0) return null;

	const isCN = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-') === 'zh-cn';

	// 좋은 순서대로: 기기 안 zh-CN → 기기 안 아무 중국어 → 클라우드 zh-CN → 나머지
	return (
		zh.find((v) => v.localService && isCN(v)) ??
		zh.find((v) => v.localService) ??
		zh.find(isCN) ??
		zh[0]
	);
}

/**
 * 이 기기에서 중국어를 읽어줄 수 있나.
 *
 * ★ 목소리 목록은 늦게 채워집니다.
 *   브라우저가 처음에는 빈 배열을 주고, 준비되면 voiceschanged 로 알려줍니다.
 *   처음 값만 보고 "없다" 고 판단하면, 되는 기기에서도 버튼이 안 나옵니다.
 *
 * 돌려주는 값: null 이면 아직 확인 중, true/false 면 답이 나온 것입니다.
 */
export function useCanSpeak(): boolean | null {
	const [can, setCan] = useState<boolean | null>(null);

	useEffect(() => {
		if (!hasApi()) {
			setCan(false);
			return;
		}

		const look = () => setCan(chineseVoice() !== null);
		look();

		window.speechSynthesis.addEventListener('voiceschanged', look);

		// 알림이 아예 안 오는 브라우저가 있습니다. 잠시 뒤 한 번 더 봅니다.
		const later = setTimeout(look, 1200);

		return () => {
			window.speechSynthesis.removeEventListener('voiceschanged', look);
			clearTimeout(later);
		};
	}, []);

	return can;
}

/**
 * 중국어로 읽습니다.
 *
 * 조금 느리게 읽습니다(0.85). 배우는 사람에게는 원어민 속도가 너무 빠릅니다.
 *
 * 읽던 것이 있으면 끊고 새로 읽습니다. 여러 개를 연달아 누르면
 * 큐에 쌓여서 한참 뒤까지 계속 떠듭니다.
 *
 * `onEnd` 는 **다 읽었을 때** 부릅니다 (안 주면 그냥 읽고 맙니다).
 *
 * ★ 왜 필요한가 — 같은 단어를 두 번 들려주려면 첫 번째가 언제 끝나는지를
 *   알아야 합니다. 위에 적힌 대로 이 함수는 **읽던 것을 끊습니다.**
 *   그래서 "2초 뒤에 한 번 더" 처럼 시계로 짐작해 두 번째를 걸면,
 *   `不好意思` 같은 긴 단어는 아직 읽는 중에 끊겨서 **첫 번째가 잘립니다.**
 *   ③ 받아쓰기 타임(듣기)에서 실제로 그랬습니다.
 *
 * ★ 끊겨서 끝난 것도 '끝' 으로 봅니다 (`onerror`).
 *   다음 문제로 넘어가느라 끊긴 것인지 진짜 오류인지 여기서는 알 수 없고,
 *   안 부르면 부르는 쪽이 **영영 기다립니다.** 넘어가느라 끊긴 경우는
 *   부르는 쪽이 "지금 것이 맞나" 를 보고 걸러야 합니다.
 *
 * ⚠ **`onEnd` 가 아예 안 오는 기기가 있습니다.** 브라우저마다 다릅니다.
 *   두 번 들려주는 것처럼 소리에 이어 붙는 일이 있으면, 부르는 쪽에
 *   **예비 시계를 같이** 둬야 그 기기에서 게임이 멈추지 않습니다.
 */
export function speak(text: string, onEnd?: () => void): boolean {
	const voice = chineseVoice();
	if (!voice || !text.trim()) return false;

	window.speechSynthesis.cancel();

	const say = new SpeechSynthesisUtterance(text);
	say.voice = voice;
	say.lang = voice.lang;
	say.rate = 0.85;
	if (onEnd) {
		say.onend = () => onEnd();
		say.onerror = () => onEnd();
	}
	window.speechSynthesis.speak(say);
	return true;
}

/**
 * 같은 것을 몇 번 들려줍니다. **그만두는 함수**를 돌려줍니다.
 *
 * 듣기 게임(③)이 문제 하나를 두 번 들려줄 때 씁니다.
 *
 * ★ 시계로 짐작하지 않습니다.
 *   `speak()` 은 읽던 것을 끊기 때문에, "2초 뒤에 한 번 더" 로 걸면
 *   `不好意思` 같은 긴 단어는 아직 읽는 중에 끊겨 **첫 번째가 잘립니다.**
 *   여기서는 **다 읽은 뒤**에 `gapMs` 만큼 쉬고 다음 것을 냅니다.
 *   짧은 단어는 빨리, 긴 단어는 늦게 두 번째가 나갑니다.
 *
 * ★ 돌려주는 함수를 반드시 부르세요.
 *   다음 문제로 넘어갈 때·화면을 나갈 때 안 부르면, **앞 문제의 '다 읽었다'
 *   신호가 뒤늦게 도착해** 새 문제 위에서 앞 단어가 울립니다. 답이 샙니다.
 *
 * ⚠ `endWaitMs` 는 **신호가 아예 안 오는 기기**를 위한 예비 시계입니다.
 *   브라우저마다 갈리는 부분이라 확인할 방법이 없습니다. 신호를 못 받으면
 *   두 번째 소리가 영영 안 나오고, 열 명이 그걸 앉아서 기다리게 됩니다.
 */
export function speakTimes(
	text: string,
	times: number,
	gapMs: number,
	endWaitMs = 6000,
): () => void {
	let alive = true;
	const timers: ReturnType<typeof setTimeout>[] = [];

	const stop = () => {
		alive = false;
		timers.forEach(clearTimeout);
		timers.length = 0;
	};

	const round = (left: number) => {
		if (!alive || left <= 0) return;

		// 다 읽었다는 신호와 예비 시계 중 **먼저 온 것 하나만** 씁니다.
		// 안 그러면 둘 다 들어와서 소리가 한 번 더 납니다.
		let moved = false;
		const ended = () => {
			if (moved || !alive || left <= 1) return;
			moved = true;
			timers.push(setTimeout(() => round(left - 1), gapMs));
		};

		// 목소리가 없으면 되풀이해봐야 소용없습니다
		if (!speak(text, ended)) return stop();
		timers.push(setTimeout(ended, endWaitMs));
	};

	round(times);
	return stop;
}
