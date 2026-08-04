import type { Metadata, Viewport } from 'next';
import AuthGate from '@/components/AuthGate';
import Nav from '@/components/Nav';
import RegisterServiceWorker from '@/components/RegisterServiceWorker';
import './globals.css';

export const metadata: Metadata = {
	title: 'HSK 3급 단어장',
	description: '출퇴근길 10분으로 HSK 3급 단어를 외웁니다. 한자 · 병음 · 뜻 · 예문.',
	applicationName: 'HSK 3급 단어장',
	appleWebApp: {
		capable: true,
		title: 'HSK 3급',
		statusBarStyle: 'default',
	},
	icons: {
		icon: [
			{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
			{ url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
		],
		apple: '/apple-touch-icon.png',
	},
	formatDetection: {
		// 폰에서 숫자를 전화번호로 잘못 알아보고 파랗게 칠하는 걸 막습니다
		telephone: false,
	},
};

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
	// 화면을 꽉 채워야 홈 화면에서 열었을 때 앱처럼 보입니다
	viewportFit: 'cover',
	themeColor: [
		{ media: '(prefers-color-scheme: light)', color: '#f5f7f3' },
		{ media: '(prefers-color-scheme: dark)', color: '#101714' },
	],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="ko">
			<head>
				{/*
					중국어 글꼴을 불러옵니다.

					왜 필요한가: 한국어 윈도우에는 중국어 글꼴이 없는 경우가 많습니다.
					그러면 한국어 글꼴이 한자를 대신 그려서, 중국 사람이 쓰는 모양과
					다른 글자가 나옵니다. 공부하는 사이트에서 이건 디자인 문제가 아니라
					글자가 틀린 문제입니다.

					폰(아이폰·안드로이드)에는 대부분 들어 있어서, 없을 때만 받아옵니다.
					못 받아와도 globals.css 의 글꼴 목록으로 자연스럽게 내려갑니다.
				*/}
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
				<link
					rel="stylesheet"
					href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap"
				/>
			</head>
			<body className="min-h-dvh">
				<RegisterServiceWorker />

				<div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col">
					{/* 로그인해야 안이 보입니다. 메뉴도 로그인한 뒤에 나옵니다. */}
					<AuthGate>
						<Nav />
						{/* 폰에서는 아래 메뉴에 가리지 않도록 아래를 비워둡니다 */}
						<main className="flex-1 px-4 pb-28 pt-4 md:px-6 md:pb-12 md:pt-8">{children}</main>
					</AuthGate>
				</div>
			</body>
		</html>
	);
}
