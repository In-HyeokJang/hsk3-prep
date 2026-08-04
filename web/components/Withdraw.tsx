'use client';

import { useState } from 'react';
import { withdraw } from '@/lib/useAuth';

/**
 * 탈퇴 버튼.
 *
 * 눈에 잘 안 띄는 자리에 두고, 한 번 더 물어봅니다.
 * 되돌릴 수 없는 일은 실수로 눌리면 안 되니까요.
 *
 * 무엇이 지워지고 무엇이 남는지 솔직하게 적습니다.
 * 계정 줄이 남는 건 숨길 일이 아니라 알려드릴 일입니다.
 */
export default function Withdraw({ username }: { username: string | null }) {
	const [asking, setAsking] = useState(false);
	const [typed, setTyped] = useState('');
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!asking) {
		return (
			<button
				onClick={() => setAsking(true)}
				className="self-center text-xs text-muted underline underline-offset-4"
			>
				탈퇴하기
			</button>
		);
	}

	async function go() {
		setBusy(true);
		setError(null);
		try {
			await withdraw();
			// 탈퇴하면 로그아웃됩니다. 화면은 저절로 로그인 안내로 바뀝니다.
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-3 rounded-2xl border-l-[3px] border-warn bg-warn-soft px-4 py-4">
			<p className="text-sm font-bold text-warn">정말 탈퇴하시겠어요?</p>

			<div className="text-sm text-ink-2">
				<p>
					지금까지 외운 진도와 푼 기록이 <b>전부 지워집니다.</b> 되돌릴 수 없어요.
				</p>
				<p className="mt-2 text-muted">
					아이디와 연락처는 남습니다. 같은 아이디·이메일·전화번호로 다시 가입할 수 없게
					하려는 것입니다.
				</p>
			</div>

			<label className="flex flex-col gap-1.5">
				<span className="text-sm">
					확인을 위해 아이디 <b>{username}</b> 를 적어주세요
				</span>
				<input
					value={typed}
					onChange={(e) => setTyped(e.target.value)}
					autoCapitalize="none"
					spellCheck={false}
					aria-label="탈퇴 확인용 아이디"
					className="rounded-xl border border-rule bg-paper px-4 py-3 text-base outline-none focus:border-warn"
				/>
			</label>

			{error && <p className="text-sm font-medium text-warn">{error}</p>}

			<div className="grid grid-cols-2 gap-2">
				<button
					onClick={() => {
						setAsking(false);
						setTyped('');
						setError(null);
					}}
					disabled={busy}
					className="rounded-xl border border-rule bg-paper px-4 py-3 text-sm font-semibold text-ink-2"
				>
					안 할래요
				</button>
				<button
					onClick={go}
					disabled={busy || typed.trim() !== (username ?? '')}
					className="rounded-xl bg-warn px-4 py-3 text-sm font-bold text-white disabled:opacity-40"
				>
					{busy ? '처리 중...' : '탈퇴합니다'}
				</button>
			</div>
		</div>
	);
}
