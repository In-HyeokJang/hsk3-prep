'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

/* ============================================================
   아이디로 가입하고 로그인하기

   Supabase 는 원래 이메일로 로그인합니다.
   아이디를 쓰려고, 아이디에서 내부용 주소를 만들어 넘깁니다.

     hong123  →  hong123@hsk3.local

   이 주소는 사람이 쓰는 메일함이 아닙니다. 자물쇠의 이름표 같은 것이고
   화면에는 절대 나오지 않습니다. 사용자는 아이디만 봅니다.
   ============================================================ */

/** 아이디를 내부용 주소로 바꿉니다. 이 규칙은 서버(마이그레이션 8)와 짝입니다. */
export const LOGIN_DOMAIN = 'hsk3.local';

export function loginEmail(username: string): string {
	return `${username.trim().toLowerCase()}@${LOGIN_DOMAIN}`;
}

/* ── 지금 로그인 상태 ─────────────────────────────────────── */

export type Profile = {
	user_id: string;
	username: string;
	email: string | null;
	phone: string | null;
	is_active: boolean;
	deleted_at: string | null;
	/**
	 * 관리자인가. `/live`(오프라인 모임 화면)를 여기서만 엽니다.
	 *
	 * ★ 코드에 아이디를 박지 않습니다. DB에서 켜고 끕니다 (마이그레이션 23).
	 *   관리자를 바꿔도 다시 배포하지 않아도 됩니다.
	 */
	is_admin: boolean;
};

/**
 * 로그인 상태.
 *
 * 세션(로그인했다는 표)은 Supabase가 브라우저에 저장하고 알아서 갱신합니다.
 * 우리는 "지금 로그인돼 있나 / 누구인가" 만 여기서 꺼내 씁니다.
 *
 * ★ userId 가 그대로 진도의 user_key 가 됩니다.
 */
export function useAuth() {
	const [userId, setUserId] = useState<string | null>(null);
	const [profile, setProfile] = useState<Profile | null>(null);
	const [profileFailed, setProfileFailed] = useState(false); // 못 받아왔나
	const [ready, setReady] = useState(false); // 확인이 끝났나

	const loadProfile = useCallback(async (id: string | null) => {
		if (!id) {
			setProfile(null);
			setProfileFailed(false);
			return;
		}

		const { data, error } = await supabase.rpc('my_profile');

		// ★ 못 받아온 것과 "받아왔더니 없더라" 는 다릅니다.
		//   신호가 잠깐 끊겨도 data 는 null 이 됩니다. 그걸 "프로필이 없다" 로
		//   읽으면 아이디가 빈칸이 되고, 그 빈칸을 확인 장치로 쓰는 곳이 뚫립니다.
		//   (탈퇴 확인창이 실제로 그렇게 뚫렸습니다)
		if (error) {
			setProfileFailed(true);
			return; // 이전 값을 지우지 않습니다
		}

		setProfileFailed(false);
		const p = (data as Profile) ?? null;

		// 다른 기기에서 탈퇴했는데 이 기기는 로그인된 채로 남아 있을 수 있습니다.
		// 그대로 두면 아무것도 안 되는 화면만 보게 되니, 여기서 내보냅니다.
		if (p && !p.is_active) {
			await supabase.auth.signOut();
			setProfile(null);
			return;
		}

		setProfile(p);
	}, []);

	useEffect(() => {
		let alive = true;

		supabase.auth.getSession().then(async ({ data }) => {
			if (!alive) return;
			const id = data.session?.user.id ?? null;
			setUserId(id);
			await loadProfile(id);
			if (alive) setReady(true);
		});

		// 로그인·로그아웃이 일어나면 바로 알려줍니다 (다른 탭에서 한 것도 포함)
		const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
			const id = session?.user.id ?? null;
			setUserId(id);
			void loadProfile(id);
			setReady(true);
		});

		return () => {
			alive = false;
			sub.subscription.unsubscribe();
		};
	}, [loadProfile]);

	return {
		userId,
		username: profile?.username ?? null,
		profile,
		/**
		 * 관리자인가.
		 *
		 * ★ 신호가 끊겨 프로필을 못 받아와도 이 값은 안 뒤집힙니다.
		 *   위 loadProfile 이 실패했을 때 이전 값을 그대로 두거든요.
		 *   모임 도중에 지하 회의실에서 신호가 한 번 끊겼다고 화면이
		 *   닫혀버리면, 진행하던 사람은 손쓸 방법이 없습니다.
		 */
		isAdmin: profile?.is_admin ?? false,
		/** 프로필을 못 받아왔나. 되돌릴 수 없는 일은 이게 true 면 막아야 합니다 */
		profileFailed,
		ready,
		signOut: () => supabase.auth.signOut(),
	};
}

/* ── 가입 · 로그인 ────────────────────────────────────────── */

/** Supabase가 돌려주는 영어 에러를 알아들을 수 있는 말로 바꿉니다 */
function readable(message: string): string {
	const m = message.toLowerCase();
	if (m.includes('invalid login credentials')) return '아이디나 비밀번호가 맞지 않습니다.';
	if (m.includes('user already registered')) return '이미 쓰고 있는 아이디입니다.';
	if (m.includes('password should be at least')) return '비밀번호는 6자 이상이어야 합니다.';
	if (m.includes('rate limit') || m.includes('too many')) return '잠시 뒤에 다시 시도해 주세요.';
	if (m.includes('should be different')) return '지금 쓰는 비밀번호와 같습니다.';

	// 방아쇠(trigger)에서 중복이 걸리면 Supabase 는 이 뭉뚱그린 말만 돌려줍니다.
	if (m.includes('database error saving new user')) {
		return '이미 쓰고 있는 아이디·이메일·전화번호입니다.';
	}

	// 내부용 주소가 거절당한 경우 — Confirm email 설정을 안 껐을 때 주로 납니다.
	if (m.includes('email') && (m.includes('invalid') || m.includes('confirm'))) {
		return '가입을 처리하지 못했습니다. Supabase 설정에서 이메일 확인(Confirm email)을 꺼야 합니다.';
	}

	return message;
}

export type SignUpInput = {
	username: string;
	password: string;
	/** 한 번 더 친 비밀번호. 가입 화면에서만 씁니다 */
	password2?: string;
	email: string;
	phone: string;
};

/** 가입 화면에서 쓰는 검사. 서버에도 같은 규칙이 걸려 있습니다. */
export function checkSignUp({
	username,
	password,
	password2,
	email,
	phone,
}: SignUpInput): string | null {
	const id = username.trim();

	if (!/^[A-Za-z0-9_]{4,20}$/.test(id)) {
		return '아이디는 영문·숫자·밑줄(_)로 4~20자여야 합니다.';
	}
	if (password.length < 6) return '비밀번호는 6자 이상으로 해주세요.';

	// 비밀번호를 다시 정해주는 메일을 보낼 수 없는 구조라,
	// 오타 하나가 계정을 영영 못 열게 만듭니다. 그래서 두 번 받습니다.
	if (password2 !== undefined && password !== password2) {
		return '비밀번호 두 개가 서로 다릅니다.';
	}

	const hasEmail = email.trim() !== '';
	const hasPhone = phone.trim() !== '';
	if (!hasEmail && !hasPhone) {
		return '나중에 아이디·비밀번호를 찾으려면 이메일이나 전화번호 중 하나는 필요합니다.';
	}
	// 아래 두 규칙은 DB 에도 똑같이 걸려 있습니다 (마이그레이션 10).
	// 화면만 고치면 다른 경로로 어긋난 값이 들어올 수 있어서 양쪽에 둡니다.
	if (hasEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
		return '이메일 주소를 끝까지 채워주세요. (예: hong@naver.com)';
	}
	if (hasPhone && !/^0\d{1,2}-\d{3,4}-\d{4}$/.test(phone.trim())) {
		return '전화번호를 끝까지 채워주세요. (예: 010-1234-5678)';
	}
	return null;
}

const TAKEN_LABEL: Record<string, string> = {
	username: '이미 쓰고 있는 아이디입니다.',
};

/**
 * 연락처로 아이디를 찾습니다.
 *
 * 가려서 돌려줍니다 (hong1234 → ho*****4).
 * 통째로 보여주면 아무 번호나 넣어보며 남의 아이디를 모을 수 있습니다.
 * 본인은 앞뒤 글자만 봐도 기억해냅니다.
 *
 * 못 찾으면 빈 문자열입니다.
 */
export async function findUsername(email: string, phone: string): Promise<string> {
	const { data, error } = await supabase.rpc('find_username', {
		p_email: email.trim() || null,
		p_phone: phone.trim() || null,
	});
	if (error) throw new Error('찾지 못했습니다. 잠시 뒤에 다시 시도해 주세요.');
	return (data as string) ?? '';
}

/** 가입 전에 중복을 미리 물어봅니다. 진짜 자물쇠는 서버 쪽에 있습니다. */
export async function findTaken(input: SignUpInput): Promise<string | null> {
	const { data, error } = await supabase.rpc('signup_taken', {
		p_username: input.username.trim(),
		p_email: input.email.trim() || null,
		p_phone: input.phone.trim() || null,
	});

	if (error) return null; // 미리보기일 뿐이라, 못 물어봤으면 그냥 넘어갑니다
	return TAKEN_LABEL[data as string] ?? null;
}

/**
 * 가입이 어떻게 끝났나.
 *   'signed-in'   가입하고 바로 들어왔습니다. 화면이 알아서 안쪽으로 바뀝니다
 *   'need-login'  계정은 만들어졌는데 로그인까지는 안 됐습니다. 한 번 더 눌러야 합니다
 */
export type SignUpResult = 'signed-in' | 'need-login';

/**
 * 회원가입.
 *
 * ★ 에러가 없는 것과 가입된 것은 다릅니다.
 *   Supabase 는 두 경우에 에러를 내지 않고 조용히 끝냅니다.
 *
 *   1. 이미 있는 아이디 — 남의 아이디를 넣어보며 캐내는 걸 막으려고
 *      가짜 사용자를 돌려줍니다. 이때 identities 가 빈 배열입니다.
 *   2. 확인 메일을 기다리는 설정 — 계정은 생기지만 session 이 없습니다.
 *
 *   둘 다 그냥 넘기면 버튼만 눌렸다 말고 화면에 아무 말이 없습니다.
 *   가입이 됐는지 안 됐는지 모른 채로 기다리게 되는데, 첫인상에서 그러면
 *   그냥 나가버립니다.
 */
export async function signUp(input: SignUpInput): Promise<SignUpResult> {
	const taken = await findTaken(input);
	if (taken) throw new Error(taken);

	const { data, error } = await supabase.auth.signUp({
		email: loginEmail(input.username),
		password: input.password,
		options: {
			// 이 값들을 서버의 방아쇠가 받아서 profiles 에 넣습니다 (마이그레이션 8)
			data: {
				username: input.username.trim(),
				email: input.email.trim() || null,
				phone: input.phone.trim() || null,
			},
		},
	});

	if (error) throw new Error(readable(error.message));

	// 1. 가짜 사용자를 받았나 (= 이미 있는 아이디)
	if (data.user && (data.user.identities?.length ?? 0) === 0) {
		throw new Error('이미 쓰고 있는 아이디입니다.');
	}

	// 아무것도 안 돌아왔으면 만들어졌다고 말할 수 없습니다
	if (!data.user) {
		throw new Error('가입을 처리하지 못했습니다. 잠시 뒤에 다시 시도해 주세요.');
	}

	// 2. 계정은 생겼는데 로그인은 안 된 경우
	return data.session ? 'signed-in' : 'need-login';
}

/**
 * 로그인.
 *
 * 탈퇴한 계정은 비밀번호가 맞아도 들어올 수 없습니다.
 * 계정 줄은 남아 있어서 Supabase 쪽 확인은 통과하거든요.
 * 그래서 들어온 직후에 한 번 더 보고, 탈퇴한 계정이면 바로 내보냅니다.
 */
export async function signIn(username: string, password: string): Promise<void> {
	const { error } = await supabase.auth.signInWithPassword({
		email: loginEmail(username),
		password,
	});
	if (error) throw new Error(readable(error.message));

	const { data, error: profileError } = await supabase.rpc('my_profile');

	// 확인을 못 했으면 들여보내지 않습니다.
	// 탈퇴한 계정인지 모르는 채로 통과시키면, 들어와서 아무것도 안 되는데
	// 화면은 "진도 0" 으로 멀쩡해 보입니다. 그게 더 나쁩니다.
	if (profileError) {
		await supabase.auth.signOut();
		throw new Error('계정을 확인하지 못했습니다. 잠시 뒤에 다시 시도해 주세요.');
	}

	const profile = data as Profile | null;

	if (profile && !profile.is_active) {
		await supabase.auth.signOut();
		throw new Error('탈퇴한 계정입니다. 이 아이디로는 다시 들어올 수 없습니다.');
	}
}

/**
 * 탈퇴.
 *
 * 진도와 푼 기록은 지워지고, 계정 줄은 남습니다.
 * 남은 줄이 같은 아이디·이메일·전화번호로 다시 가입하는 것을 막습니다.
 *
 * 돌려주는 값: 지워진 진도 줄 수
 */
export async function withdraw(): Promise<number> {
	const { data, error } = await supabase.rpc('withdraw_account');
	if (error) throw new Error(`탈퇴하지 못했습니다: ${error.message}`);

	await supabase.auth.signOut();
	return (data as number) ?? 0;
}

/* ── 비밀번호 바꾸기 ──────────────────────────────────────── */

/** 새 비밀번호가 쓸 만한지. 서버에 보내기 전에 화면에서 먼저 봅니다 */
export function checkNewPassword(
	current: string,
	next: string,
	next2: string,
): string | null {
	if (!current) return '지금 쓰는 비밀번호를 적어주세요.';
	if (next.length < 6) return '새 비밀번호는 6자 이상으로 해주세요.';
	// 가입할 때와 같은 이유입니다. 되찾을 길이 없어서 오타 하나가 계정을 닫습니다.
	if (next !== next2) return '새 비밀번호 두 개가 서로 다릅니다.';
	if (next === current) return '지금 쓰는 비밀번호와 같습니다.';
	return null;
}

/**
 * 비밀번호 바꾸기.
 *
 * ★ 지금 비밀번호를 먼저 확인합니다.
 *   Supabase 는 로그인만 돼 있으면 그냥 바꿔줍니다. 그러면 폰을 잠깐
 *   놓아둔 사이에 남이 비밀번호를 바꿔서 계정을 가져갈 수 있습니다.
 *   확인은 그 비밀번호로 다시 한번 로그인해보는 것으로 합니다.
 *   틀리면 로그인이 실패할 뿐, 지금 세션은 그대로 남습니다.
 *
 * ★ 아이디는 화면에서 받지 않고 지금 세션에서 꺼냅니다.
 *   내부용 주소(hong123@hsk3.local)를 사용자에게 물어볼 수는 없으니까요.
 */
export async function changePassword(current: string, next: string): Promise<void> {
	const { data, error: who } = await supabase.auth.getUser();
	if (who || !data.user?.email) {
		throw new Error('로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.');
	}

	const { error: wrong } = await supabase.auth.signInWithPassword({
		email: data.user.email,
		password: current,
	});
	if (wrong) throw new Error('지금 쓰는 비밀번호가 맞지 않습니다.');

	const { error } = await supabase.auth.updateUser({ password: next });
	if (error) throw new Error(readable(error.message));
}

/**
 * 연락처 고치기.
 *
 * 모양 다듬기와 "둘 중 하나는 남기기" 는 서버가 합니다 (마이그레이션 12).
 */
export async function updateContact(email: string, phone: string): Promise<void> {
	const { error } = await supabase.rpc('update_contact', {
		p_email: email.trim() || null,
		p_phone: phone.trim() || null,
	});
	if (error) throw new Error(readable(error.message));
}
