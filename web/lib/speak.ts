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
 */
export function speak(text: string): boolean {
	const voice = chineseVoice();
	if (!voice || !text.trim()) return false;

	window.speechSynthesis.cancel();

	const say = new SpeechSynthesisUtterance(text);
	say.voice = voice;
	say.lang = voice.lang;
	say.rate = 0.85;
	window.speechSynthesis.speak(say);
	return true;
}
