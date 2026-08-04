'use client';

import { useState } from 'react';

/* ============================================================
   찾기용 연락처 칸

   한 칸에 자유롭게 적게 두면 사람마다 다른 모양으로 들어옵니다.
     01012345678 / 010 1234 5678 / +82 10 1234 5678 ...

   칸을 나눠 받으면 모양이 저절로 맞습니다.
   나눠 받은 값은 하나로 합쳐서 위로 올려보냅니다.
     이메일    아이디@주소
     전화번호  010-1234-5678
   ============================================================ */

const DOMAINS = [
	'naver.com',
	'gmail.com',
	'daum.net',
	'hanmail.net',
	'kakao.com',
	'nate.com',
	'outlook.com',
	'icloud.com',
];

/** 직접입력을 고르면 주소를 손으로 칩니다 */
const CUSTOM = '__custom__';

const PREFIXES = ['010', '011', '016', '017', '018', '019', '02', '070'];

const field =
	'rounded-xl border border-rule bg-paper px-3.5 py-3.5 text-base outline-none focus:border-accent';

/* ── 이메일 ────────────────────────────────────────────────── */

export function EmailField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	// value 는 'hong@naver.com' 처럼 합쳐진 값입니다. 여기서 두 조각으로 나눠 씁니다.
	const [local, setLocal] = useState('');
	const [picked, setPicked] = useState(DOMAINS[0]);
	const [custom, setCustom] = useState('');

	function push(nextLocal: string, nextPicked: string, nextCustom: string) {
		const domain = nextPicked === CUSTOM ? nextCustom.trim() : nextPicked;
		const id = nextLocal.trim();
		onChange(id && domain ? `${id}@${domain}` : '');
	}

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-sm font-medium">
				이메일 <span className="font-normal text-muted">(찾기용)</span>
			</span>

			<div className="flex items-center gap-2">
				<input
					value={local}
					onChange={(e) => {
						// @ 를 통째로 붙여넣으면 알아서 나눠 담습니다
						const raw = e.target.value;
						if (raw.includes('@')) {
							const [id, dom] = raw.split('@');
							const known = DOMAINS.includes(dom);
							setLocal(id);
							setPicked(known ? dom : CUSTOM);
							if (!known) setCustom(dom);
							push(id, known ? dom : CUSTOM, known ? '' : dom);
							return;
						}
						setLocal(raw);
						push(raw, picked, custom);
					}}
					autoComplete="off"
					autoCapitalize="none"
					spellCheck={false}
					placeholder="아이디"
					aria-label="이메일 아이디"
					className={`${field} min-w-0 flex-1`}
				/>

				<span className="shrink-0 text-muted">@</span>

				{picked === CUSTOM ? (
					<input
						value={custom}
						onChange={(e) => {
							setCustom(e.target.value);
							push(local, picked, e.target.value);
						}}
						autoCapitalize="none"
						spellCheck={false}
						placeholder="주소 직접 입력"
						aria-label="이메일 주소 직접 입력"
						className={`${field} min-w-0 flex-1`}
					/>
				) : (
					<span className="min-w-0 flex-1 truncate text-base">{picked}</span>
				)}
			</div>

			<select
				value={picked}
				onChange={(e) => {
					setPicked(e.target.value);
					push(local, e.target.value, custom);
				}}
				aria-label="이메일 주소 고르기"
				className={field}
			>
				{DOMAINS.map((d) => (
					<option key={d} value={d}>
						{d}
					</option>
				))}
				<option value={CUSTOM}>직접 입력</option>
			</select>
		</div>
	);
}

/* ── 전화번호 ──────────────────────────────────────────────── */

export function PhoneField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
	const [head, setHead] = useState(PREFIXES[0]);
	const [mid, setMid] = useState('');
	const [tail, setTail] = useState('');

	function push(h: string, m: string, t: string) {
		onChange(m && t ? `${h}-${m}-${t}` : '');
	}

	/** 숫자만 남기고 정해진 길이까지만 받습니다 */
	const digits = (s: string, max: number) => s.replace(/\D/g, '').slice(0, max);

	return (
		<div className="flex flex-col gap-1.5">
			<span className="text-sm font-medium">
				전화번호 <span className="font-normal text-muted">(찾기용)</span>
			</span>

			<div className="flex items-center gap-2">
				<select
					value={head}
					onChange={(e) => {
						setHead(e.target.value);
						push(e.target.value, mid, tail);
					}}
					aria-label="전화번호 앞자리"
					className={`${field} shrink-0`}
				>
					{PREFIXES.map((p) => (
						<option key={p} value={p}>
							{p}
						</option>
					))}
				</select>

				<span className="shrink-0 text-muted">-</span>

				<input
					value={mid}
					onChange={(e) => {
						const v = digits(e.target.value, 4);
						setMid(v);
						push(head, v, tail);
					}}
					inputMode="numeric"
					placeholder="1234"
					aria-label="전화번호 가운데 자리"
					className={`${field} w-0 min-w-0 flex-1 text-center`}
				/>

				<span className="shrink-0 text-muted">-</span>

				<input
					value={tail}
					onChange={(e) => {
						const v = digits(e.target.value, 4);
						setTail(v);
						push(head, mid, v);
					}}
					inputMode="numeric"
					placeholder="5678"
					aria-label="전화번호 끝자리"
					className={`${field} w-0 min-w-0 flex-1 text-center`}
				/>
			</div>
		</div>
	);
}
