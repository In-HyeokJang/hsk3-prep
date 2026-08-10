'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// 폰과 데스크톱에서 메뉴 위치가 다릅니다.
//   폰      → 화면 아래. 한 손으로 엄지가 닿는 자리입니다.
//   데스크톱 → 화면 위. 마우스는 위쪽이 자연스럽습니다.

const ITEMS = [
	{ href: '/', label: '오늘', icon: Today },
	{ href: '/study', label: '학습', icon: Cards },
	{ href: '/tone', label: '성조', icon: Wave },
	{ href: '/review', label: '오답', icon: Flag },
	{ href: '/words', label: '단어장', icon: List },
] as const;

export default function Nav() {
	const pathname = usePathname();
	const isActive = (href: string) =>
		href === '/' ? pathname === '/' : pathname.startsWith(href);

	return (
		<>
			{/* ── 데스크톱: 위쪽 ── */}
			<header className="hidden border-b border-rule px-6 py-4 md:block">
				<div className="flex items-baseline gap-8">
					<Link href="/" className="flex items-baseline gap-2">
						<span className="han text-2xl font-bold text-accent">汉</span>
						<span className="text-lg font-bold tracking-tight">HSK 3급 단어장</span>
					</Link>

					<nav className="flex gap-1">
						{ITEMS.map(({ href, label }) => (
							<Link
								key={href}
								href={href}
								aria-current={isActive(href) ? 'page' : undefined}
								className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
									isActive(href)
										? 'bg-accent-soft text-accent'
										: 'text-muted hover:text-ink'
								}`}
							>
								{label}
							</Link>
						))}
					</nav>
				</div>
			</header>

			{/* ── 폰: 위쪽 제목만 ── */}
			<header className="flex items-baseline gap-2 px-4 pt-4 md:hidden">
				<span className="han text-xl font-bold text-accent">汉</span>
				<h1 className="text-base font-bold tracking-tight">HSK 3급 단어장</h1>
			</header>

			{/* ── 폰: 아래쪽 메뉴 ── */}
			<nav
				className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper/95 backdrop-blur md:hidden"
				style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
			>
				<div className="mx-auto flex max-w-md">
					{ITEMS.map(({ href, label, icon: Icon }) => {
						const active = isActive(href);
						return (
							<Link
								key={href}
								href={href}
								aria-current={active ? 'page' : undefined}
								className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
									active ? 'text-accent' : 'text-muted'
								}`}
							>
								<Icon active={active} />
								{label}
							</Link>
						);
					})}
				</div>
			</nav>
		</>
	);
}

/* ── 아이콘 (그림 파일 대신 직접 그립니다) ────────────────── */

type IconProps = { active?: boolean };
const stroke = { strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Today({ active }: IconProps) {
	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke}>
			<rect x="3.5" y="5" width="17" height="15" rx="2.5" fill={active ? 'currentColor' : 'none'} fillOpacity="0.12" />
			<path d="M8 3.5v3M16 3.5v3M3.5 10h17" />
		</svg>
	);
}

function Cards({ active }: IconProps) {
	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke}>
			<rect x="6" y="7" width="14" height="13" rx="2.5" fill={active ? 'currentColor' : 'none'} fillOpacity="0.12" />
			<path d="M4 16.5V6a2 2 0 0 1 2-2h9" />
		</svg>
	);
}

/** 성조. 소리가 오르내리는 모양입니다 */
function Wave({ active }: IconProps) {
	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke}>
			<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill={active ? 'currentColor' : 'none'} fillOpacity="0.12" />
			<path d="M6.5 14.5c2.5 0 2.5-5 5-5s2.5 5 5 5" />
		</svg>
	);
}

/** 오답 노트. 틀린 자리에 꽂아두는 깃발입니다 */
function Flag({ active }: IconProps) {
	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke}>
			<path d="M6 21V4" />
			<path
				d="M6 4.5h11l-2.5 4 2.5 4H6z"
				fill={active ? 'currentColor' : 'none'}
				fillOpacity="0.12"
			/>
		</svg>
	);
}

function List({ active }: IconProps) {
	return (
		<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke}>
			<rect x="3.5" y="4.5" width="17" height="15" rx="2.5" fill={active ? 'currentColor' : 'none'} fillOpacity="0.12" />
			<path d="M7.5 9h9M7.5 12.5h9M7.5 16h5" />
		</svg>
	);
}
