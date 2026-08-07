'use client';

import { useState } from 'react';
import { speak, useCanSpeak } from '@/lib/speak';

/**
 * 스피커 버튼.
 *
 * ★ 중국어 목소리가 없는 기기에서는 아예 안 나옵니다.
 *   눌러도 소리가 안 나는 버튼은 "고장난 사이트" 로 읽힙니다.
 *   없는 것을 없다고 하는 편이 낫습니다.
 *
 * 왜 없는지는 이 버튼이 아니라 SpeakNote 가 한 번만 알려줍니다.
 * 한자마다 "목소리가 없어요" 가 붙으면 화면이 안내문으로 뒤덮입니다.
 */
export default function Speak({
	text,
	label,
	big,
}: {
	text: string;
	/** 화면 읽어주는 기계가 읽을 말. "예문 듣기" 처럼 */
	label?: string;
	big?: boolean;
}) {
	const can = useCanSpeak();
	const [playing, setPlaying] = useState(false);

	if (can !== true || !text.trim()) return null;

	return (
		<button
			type="button"
			aria-label={label ?? '중국어로 듣기'}
			onClick={() => {
				if (!speak(text)) return;
				// 다 읽었는지까지 좇지는 않습니다. 눌린 것만 잠깐 보여주면 충분합니다.
				setPlaying(true);
				setTimeout(() => setPlaying(false), 600);
			}}
			className={`grid shrink-0 place-items-center rounded-full border border-rule text-accent transition-colors active:bg-accent-soft ${
				big ? 'size-11' : 'size-8'
			} ${playing ? 'bg-accent-soft' : ''}`}
		>
			<svg
				width={big ? 22 : 17}
				height={big ? 22 : 17}
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M11 5 6.5 9H3.5v6h3L11 19z" fill="currentColor" fillOpacity="0.15" />
				<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
				<path d="M18.5 6.5a7.5 7.5 0 0 1 0 11" />
			</svg>
		</button>
	);
}

/**
 * 왜 스피커가 안 보이는지 알려주는 한 줄.
 *
 * 기기에 중국어 목소리가 있으면 아무것도 안 그립니다.
 * 사이트가 고장난 게 아니라는 걸 여기서만 한 번 말해줍니다.
 */
export function SpeakNote() {
	const can = useCanSpeak();
	if (can !== false) return null;

	return (
		<p className="rounded-xl bg-paper-2 px-4 py-3 text-xs text-muted">
			이 기기에는 <b className="text-ink-2">중국어 목소리가 없어서</b> 듣기 버튼을 숨겼어요.
			고장난 게 아닙니다. 폰(아이폰·안드로이드)에서는 대부분 됩니다. 윈도우라면 설정 → 시간 및
			언어 → 언어에서 중국어(중국)를 더하면 생깁니다.
		</p>
	);
}
