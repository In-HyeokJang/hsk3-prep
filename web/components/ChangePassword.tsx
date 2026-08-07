'use client';

import { useState } from 'react';
import { changePassword, checkNewPassword } from '@/lib/useAuth';

/**
 * 비밀번호 바꾸기.
 *
 * 왜 필요한가:
 *   이 사이트는 비밀번호를 다시 정해주는 메일을 보낼 수 없습니다
 *   (아이디로 가입해서 받을 메일함이 없습니다). 잊으면 관리자가
 *   직접 바꿔줘야 합니다. 그래서 스스로 바꿀 자리는 있어야 합니다.
 *
 * 평소에는 접어둡니다. 설정 칸에서 늘 펼쳐져 있을 일은 아니라서요.
 */
export default function ChangePassword() {
	const [open, setOpen] = useState(false);
	const [current, setCurrent] = useState('');
	const [next, setNext] = useState('');
	const [next2, setNext2] = useState('');

	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [done, setDone] = useState(false);

	function close() {
		setOpen(false);
		setCurrent('');
		setNext('');
		setNext2('');
		setError(null);
	}

	async function go(e: React.FormEvent) {
		e.preventDefault();

		const bad = checkNewPassword(current, next, next2);
		if (bad) {
			setError(bad);
			return;
		}

		setBusy(true);
		setError(null);
		try {
			await changePassword(current, next);
			// ★ 성공을 서버가 에러를 안 냈다는 것으로만 판단합니다.
			//   여기서 더 확인할 방법이 없습니다 — 비밀번호는 읽어올 수가 없어서요.
			setDone(true);
			close();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	}

	if (!open) {
		return (
			<div className="flex items-center justify-between gap-4">
				<span className="min-w-0">
					<span className="block text-base font-semibold">비밀번호</span>
					<span className="block text-sm text-muted">
						{done ? '바꿨습니다. 다음부터 새 비밀번호로 들어오세요.' : '스스로 바꿀 수 있어요.'}
					</span>
				</span>
				<button
					onClick={() => {
						setOpen(true);
						setDone(false);
					}}
					className="shrink-0 rounded-lg border border-rule px-3 py-1.5 text-sm font-semibold text-ink-2"
				>
					바꾸기
				</button>
			</div>
		);
	}

	return (
		<form onSubmit={go} className="flex flex-col gap-3">
			<p className="text-base font-semibold">비밀번호 바꾸기</p>

			{/* 잊으면 되찾을 길이 없다는 것을 여기서 한 번 더 말합니다.
			    가입 화면에서만 적어두면 그때 읽고 잊어버립니다. */}
			<p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-sm text-ink-2">
				이 사이트는 <b className="text-warn">비밀번호 찾기가 없습니다.</b> 잊으면 관리자가 직접
				바꿔줘야 해요. 꼭 기억할 수 있는 것으로 정해주세요.
			</p>

			<Field
				label="지금 쓰는 비밀번호"
				value={current}
				onChange={setCurrent}
				autoComplete="current-password"
				autoFocus
			/>
			<Field
				label="새 비밀번호 (6자 이상)"
				value={next}
				onChange={setNext}
				autoComplete="new-password"
			/>
			<Field
				label="새 비밀번호 한 번 더"
				value={next2}
				onChange={setNext2}
				autoComplete="new-password"
			/>

			{error && (
				<p className="rounded-xl border-l-[3px] border-warn bg-warn-soft px-3.5 py-2.5 text-sm font-medium text-warn">
					{error}
				</p>
			)}

			<div className="grid grid-cols-2 gap-2">
				<button
					type="button"
					onClick={close}
					disabled={busy}
					className="rounded-xl border border-rule px-4 py-3 text-sm font-semibold text-ink-2"
				>
					그만두기
				</button>
				<button
					type="submit"
					disabled={busy}
					className="rounded-xl bg-accent px-4 py-3 text-sm font-bold text-paper disabled:opacity-40"
				>
					{busy ? '바꾸는 중...' : '바꾸기'}
				</button>
			</div>
		</form>
	);
}

function Field({
	label,
	value,
	onChange,
	autoComplete,
	autoFocus,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	autoComplete: string;
	autoFocus?: boolean;
}) {
	return (
		<label className="flex flex-col gap-1.5">
			<span className="text-sm text-ink-2">{label}</span>
			<input
				type="password"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				autoComplete={autoComplete}
				autoFocus={autoFocus}
				className="rounded-xl border border-rule bg-paper px-4 py-3 text-base outline-none focus:border-accent"
			/>
		</label>
	);
}
