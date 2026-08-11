'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/useAuth';
import { Loading } from '@/components/ui';

/**
 * 오프라인 모임 화면 `/live`.
 *
 * TV/프로젝터에 띄우고 6~10명이 다같이 보는 화면입니다.
 * 기획은 docs/13-offline-game.md, 작업 목록은 docs/14-wbs3.md 에 있습니다.
 *
 * 지금은 문지기만 있습니다. 화면 내용은 L1 에서 채웁니다.
 *
 * ★ 이 문지기가 지키지 못하는 것
 *   기술을 아는 사람이 주소를 직접 치고 들어오는 것은 막지 못합니다.
 *   다만 이 화면이 읽을 v_words 는 이미 anon 에게 열려 있어서
 *   새로 새는 정보가 0입니다. 모임 진행용으로는 이걸로 충분합니다.
 *   나중에 저장이나 유료 자료를 다루게 되면 그때는 서버(RLS·함수)에
 *   is_admin() 을 걸어야 합니다.
 */
export default function LivePage() {
	const { isAdmin, profileFailed, ready } = useAuth();

	if (!ready) return <Loading text="확인하는 중..." />;

	// ★ 못 받아온 것과 "관리자가 아니다" 는 다릅니다.
	//   신호가 끊겨 프로필을 못 받았는데 "권한 없음" 이라고 말해버리면,
	//   진행하는 사람은 자기 계정이 잘못된 줄 알고 모임 중에 헤맵니다.
	//   무엇이 문제인지 다르게 말해줘야 합니다.
	if (!isAdmin && profileFailed) {
		return (
			<Notice
				title="계정을 확인하지 못했습니다"
				body="신호가 잠깐 끊긴 것 같습니다. 잠시 뒤에 새로고침해 주세요."
			/>
		);
	}

	if (!isAdmin) {
		return (
			<Notice
				title="모임 진행용 화면입니다"
				body="오프라인 모임을 진행하는 사람만 쓰는 화면이에요. 학습은 아래 메뉴에서 이어가시면 됩니다."
			/>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<h1 className="text-xl font-bold tracking-tight">모임 화면</h1>
			<p className="text-sm leading-relaxed text-muted">
				TV에 띄우고 다같이 보는 화면입니다. 아직 준비 중이에요.
			</p>
		</div>
	);
}

function Notice({ title, body }: { title: string; body: string }) {
	return (
		<div className="flex flex-col items-start gap-3 rounded-xl border border-rule px-5 py-6">
			<h1 className="text-base font-bold tracking-tight">{title}</h1>
			<p className="text-sm leading-relaxed text-muted">{body}</p>
			<Link href="/" className="text-sm font-medium text-accent">
				오늘의 단어로 →
			</Link>
		</div>
	);
}
