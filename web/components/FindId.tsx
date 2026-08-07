'use client';

import { useState } from 'react';
import { findUsername } from '@/lib/useAuth';
import { EmailField, PhoneField } from '@/components/ContactFields';

/**
 * 아이디 찾기.
 *
 * 가입할 때 적어둔 이메일이나 전화번호로 찾습니다.
 * 아이디는 가려서 보여줍니다 (ho*****4).
 *
 * ★ 비밀번호는 여기서 못 찾습니다.
 *   로그인에 쓰는 주소가 hong1234@hsk3.local 이라는 내부용 주소여서
 *   재설정 메일을 보낼 곳이 없습니다. 그 사실을 숨기지 않고 적어둡니다.
 *   "찾을 수 있겠지" 하고 믿다가 못 찾는 것이 제일 나쁩니다.
 */
export default function FindId({ onBack }: { onBack: () => void }) {
	const [email, setEmail] = useState('');
	const [phone, setPhone] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [found, setFound] = useState<string | null>(null);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setFound(null);

		if (!email.trim() && !phone.trim()) {
			return setError('가입할 때 적으신 이메일이나 전화번호를 넣어주세요.');
		}

		setBusy(true);
		try {
			const masked = await findUsername(email, phone);
			if (!masked) {
				setError('그 연락처로 가입된 계정을 찾지 못했습니다.');
			} else {
				setFound(masked);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-10">
			<div className="text-center">
				<p className="han text-5xl leading-none">汉</p>
				<h1 className="mt-4 text-2xl font-bold tracking-tight">아이디 찾기</h1>
				<p className="mt-2 text-sm text-muted">가입할 때 적으신 연락처를 넣어주세요.</p>
			</div>

			{found ? (
				<div className="flex flex-col gap-4">
					<div className="rounded-2xl border border-rule-soft bg-paper-2/60 px-4 py-6 text-center">
						<p className="text-sm text-muted">이 연락처의 아이디는</p>
						<p className="pinyin mt-2 text-3xl font-bold tracking-widest text-accent">{found}</p>
						<p className="mt-3 text-xs text-muted">
							가운데는 가렸습니다. 앞뒤 글자로 기억해 보세요.
						</p>
					</div>

					<button
						onClick={onBack}
						className="rounded-xl bg-accent px-5 py-3.5 text-base font-bold text-paper"
					>
						로그인하러 가기
					</button>
				</div>
			) : (
				<form onSubmit={submit} className="flex flex-col gap-3">
					<EmailField value={email} onChange={setEmail} />
					<PhoneField value={phone} onChange={setPhone} />

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
						{busy ? '찾는 중...' : '아이디 찾기'}
					</button>
				</form>
			)}

			{/* 비밀번호는 못 찾습니다. 숨기지 않고 적습니다. */}
			<div className="rounded-xl border-l-[3px] border-warn bg-warn-soft px-4 py-3.5 text-sm text-ink-2">
				<p className="font-bold text-warn">비밀번호는 여기서 못 찾습니다</p>
				<p className="mt-1">
					이 사이트는 아이디로 로그인해서, 비밀번호를 새로 정하는 메일을 보낼 수 없습니다.
					잊으셨다면 <b>만든 사람에게 문의</b>해 주세요. 직접 바꿔드릴 수 있습니다.
				</p>
			</div>

			<button onClick={onBack} className="text-sm text-muted underline underline-offset-4">
				← 로그인으로 돌아가기
			</button>
		</div>
	);
}
