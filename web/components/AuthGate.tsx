'use client';

import { useEffect, useState } from 'react';
import { checkSignUp, signIn, signUp, useAuth } from '@/lib/useAuth';
import { EmailField, PhoneField } from '@/components/ContactFields';
import FindId from '@/components/FindId';
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

	const [mode, setMode] = useState<'in' | 'up' | 'find'>('in');
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [password2, setPassword2] = useState('');
	const [showPw, setShowPw] = useState(false);
	const [email, setEmail] = useState('');
	const [phone, setPhone] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	// 나쁜 소식만 있고 좋은 소식이 없으면, 잘된 건지 아무 일도 안 일어난 건지 모릅니다
	const [notice, setNotice] = useState<string | null>(null);

	// 로그아웃하면 폼을 처음 상태로 되돌립니다.
	//
	// 안 하면 가입하고 로그아웃했을 때 가입 화면이 그대로 다시 뜹니다.
	// 그러면 "아이디를 잊으셨나요" 도 안 보이고, 친 비밀번호도 남아 있습니다.
	useEffect(() => {
		if (userId) return;
		setMode('in');
		setUsername('');
		setPassword('');
		setPassword2('');
		setShowPw(false);
		setEmail('');
		setPhone('');
		setError(null);
		setNotice(null);
	}, [userId]);

	if (!ready) return <Loading text="확인하는 중..." />;
	if (userId) return <>{children}</>;
	if (mode === 'find') return <FindId onBack={() => setMode('in')} />;

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setNotice(null);

		if (mode === 'up') {
			const bad = checkSignUp({ username, password, password2, email, phone });
			if (bad) return setError(bad);
		} else if (!username.trim() || !password) {
			return setError('아이디와 비밀번호를 넣어주세요.');
		}

		setBusy(true);
		try {
			if (mode === 'up') {
				const how = await signUp({ username, password, email, phone });

				// 'signed-in' 이면 화면이 알아서 안쪽으로 바뀝니다. 여기서 할 일이 없습니다.
				// 'need-login' 은 계정은 생겼는데 로그인이 안 된 것입니다.
				// 그대로 두면 가입 화면에 그냥 앉아 있게 됩니다 — 로그인 쪽으로 옮겨주고 말해줍니다.
				if (how === 'need-login') {
					setMode('in');
					setPassword('');
					setPassword2('');
					setEmail('');
					setPhone('');
					setNotice(`가입됐습니다. 이제 ${username.trim()} 로 로그인해 주세요.`);
				}
			} else {
				await signIn(username, password);
			}
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
						type={showPw ? 'text' : 'password'}
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
						{/* ★ 한 번 더 받습니다.
						    이 사이트는 비밀번호를 다시 정해주는 메일을 보낼 수 없습니다.
						    오타 하나로 계정이 영영 안 열리는 일이 실제로 생길 수 있어서,
						    가입할 때 두 번 확인합니다. */}
						<label className="flex flex-col gap-1.5">
							<span className="text-sm font-medium">비밀번호 확인</span>
							<input
								type={showPw ? 'text' : 'password'}
								value={password2}
								onChange={(e) => setPassword2(e.target.value)}
								autoComplete="new-password"
								placeholder="한 번 더"
								aria-label="비밀번호 확인"
								className={field}
							/>
						</label>

						{password2 !== '' && (
							<p className={`text-sm ${password === password2 ? 'text-accent' : 'text-warn'}`}>
								{password === password2 ? '두 개가 같아요' : '두 개가 다릅니다'}
							</p>
						)}
					</>
				)}

				<label className="flex items-center gap-2 text-sm text-muted">
					<input
						type="checkbox"
						checked={showPw}
						onChange={(e) => setShowPw(e.target.checked)}
						className="size-4"
					/>
					비밀번호 보이기
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

				{notice && (
					<p className="rounded-xl border-l-[3px] border-accent bg-accent-soft px-4 py-3 text-sm text-ink-2">
						{notice}
					</p>
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

			{/* 비밀번호를 새로 정해주는 메일을 보낼 수 없는 구조입니다.
			    그 사실을 가입 전에 알려드립니다. 나중에 알면 늦습니다. */}
			{mode === 'up' && (
				<p className="rounded-xl border-l-[3px] border-warn bg-warn-soft px-4 py-3.5 text-sm text-ink-2">
					<b className="text-warn">비밀번호를 꼭 기억해 주세요.</b> 이 사이트는 비밀번호를 새로
					정하는 메일을 보내지 않습니다. 잊으면 만든 사람에게 문의하셔야 합니다.
				</p>
			)}

			<div className="flex flex-col items-center gap-3">
				<button
					onClick={() => {
						setMode(mode === 'in' ? 'up' : 'in');
						setError(null);
						setNotice(null);
					}}
					className="px-4 py-2 text-sm text-muted underline underline-offset-4"
				>
					{mode === 'in' ? '아직 계정이 없어요 · 가입하기' : '이미 계정이 있어요 · 로그인'}
				</button>

				{mode === 'in' && (
					<button
						onClick={() => {
							setMode('find');
							setError(null);
						}}
						className="px-4 py-2 text-sm text-muted underline underline-offset-4"
					>
						아이디를 잊으셨나요
					</button>
				)}
			</div>
		</div>
	);
}
