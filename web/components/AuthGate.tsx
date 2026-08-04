'use client';

import { useState } from 'react';
import { checkSignUp, claimOldProgress, signIn, signUp, useAuth } from '@/lib/useAuth';
import { EmailField, PhoneField } from '@/components/ContactFields';
import { Loading } from '@/components/ui';

/**
 * 로그인 문지기.
 *
 * 로그인하지 않았으면 아래 화면만 보여주고, 사이트 내용은 그리지 않습니다.
 * 진도는 서버에서도 "내 것만" 으로 잠가뒀지만(마이그레이션 7),
 * 화면에서도 막아야 로그인 안 한 사람이 빈 화면을 보고 헤매지 않습니다.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
	const { userId, ready } = useAuth();

	const [mode, setMode] = useState<'in' | 'up'>('in');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [email, setEmail] = useState('');
	const [phone, setPhone] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!ready) return <Loading text="확인하는 중..." />;
	if (userId) return <>{children}</>;

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);

		if (mode === 'up') {
			const bad = checkSignUp({ username, password, email, phone });
			if (bad) return setError(bad);
		} else if (!username.trim() || !password) {
			return setError('아이디와 비밀번호를 넣어주세요.');
		}

		setBusy(true);
		try {
			if (mode === 'up') {
				await signUp({ username, password, email, phone });
			} else {
				await signIn(username, password);
			}

			// 로그인 전에 브라우저에 쌓아둔 진도가 있으면 계정으로 옮겨옵니다.
			// 실패해도 로그인은 그대로 둡니다 — 진도가 안 옮겨질 뿐입니다.
			await claimOldProgress();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	const field =
		'rounded-xl border border-rule bg-paper px-4 py-3.5 text-base outline-none focus:border-accent';

	return (
		<div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-10">
			<div className="text-center">
				<p className="han text-5xl leading-none">汉</p>
				<h1 className="mt-4 text-2xl font-bold tracking-tight">HSK 3급 단어장</h1>
				<p className="mt-2 text-sm text-muted">
					{mode === 'in'
						? '로그인하면 폰과 컴퓨터에서 같은 진도로 이어집니다.'
						: '아이디와 비밀번호를 정하고, 찾기용 연락처를 하나 남겨주세요.'}
				</p>
			</div>

			<form onSubmit={submit} className="flex flex-col gap-3">
				<label className="flex flex-col gap-1.5">
					<span className="text-sm font-medium">아이디</span>
					<input
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						autoComplete="username"
						autoCapitalize="none"
						spellCheck={false}
						placeholder={mode === 'up' ? '영문·숫자·밑줄 4~20자' : '아이디'}
						aria-label="아이디"
						className={field}
					/>
				</label>

				<label className="flex flex-col gap-1.5">
					<span className="text-sm font-medium">비밀번호</span>
					<input
						type="password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
						placeholder={mode === 'up' ? '6자 이상' : '비밀번호'}
						aria-label="비밀번호"
						className={field}
					/>
				</label>

				{mode === 'up' && (
					<>
						<p className="mt-1 text-xs text-muted">
							아래 둘 중 <b className="text-ink-2">하나는 꼭</b> 적어주세요. 나중에 아이디나
							비밀번호를 잊었을 때 쓰는 것이고, 다른 데 쓰지 않습니다.
						</p>

						<EmailField value={email} onChange={setEmail} />
						<PhoneField value={phone} onChange={setPhone} />

						{/* 나눠 받은 칸이 합쳐져서 이렇게 저장됩니다. 보고 확인할 수 있게 보여줍니다. */}
						{(email || phone) && (
							<p className="rounded-xl bg-paper-2 px-4 py-3 text-sm text-muted">
								이렇게 저장돼요
								{email && (
									<span className="mt-1 block text-ink-2">
										이메일 <b>{email}</b>
									</span>
								)}
								{phone && (
									<span className="mt-1 block text-ink-2">
										전화 <b>{phone}</b>
									</span>
								)}
							</p>
						)}
					</>
				)}

				{error && (
					<p className="rounded-xl border-l-[3px] border-warn bg-warn-soft px-4 py-3 text-sm text-ink-2">
						{error}
					</p>
				)}

				<button
					type="submit"
					disabled={busy}
					className="mt-1 rounded-xl bg-accent px-5 py-3.5 text-base font-bold text-paper disabled:opacity-50"
				>
					{busy ? '잠시만요...' : mode === 'in' ? '로그인' : '가입하기'}
				</button>
			</form>

			<button
				onClick={() => {
					setMode(mode === 'in' ? 'up' : 'in');
					setError(null);
				}}
				className="text-sm text-muted underline underline-offset-4"
			>
				{mode === 'in' ? '아직 계정이 없어요 · 가입하기' : '이미 계정이 있어요 · 로그인'}
			</button>
		</div>
	);
}
