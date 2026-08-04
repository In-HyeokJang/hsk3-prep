// 스크립트 3개가 같이 쓰는 도구들.
// 이 파일은 직접 실행하지 않습니다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── .env.local 읽기 ──────────────────────────────────────────
// 라이브러리 없이 직접 읽습니다. KEY=VALUE 한 줄에 하나.

export function loadEnv() {
	for (const name of ['.env.local', '.env']) {
		const file = path.join(ROOT, name);
		if (!fs.existsSync(file)) continue;

		for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
			const line = raw.trim();
			if (!line || line.startsWith('#')) continue;

			const eq = line.indexOf('=');
			if (eq === -1) continue;

			const key = line.slice(0, eq).trim();
			let value = line.slice(eq + 1).trim();

			// 값을 따옴표로 감쌌으면 벗겨냅니다
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}

			if (!(key in process.env)) process.env[key] = value;
		}
	}
}

// ── 접속 문자열 확인 ─────────────────────────────────────────

export function requireDbUrl() {
	const url = process.env.SUPABASE_DB_URL;

	if (!url) {
		fail(
			'SUPABASE_DB_URL 이 없습니다.',
			'',
			'.env.local 파일을 만들고 접속 문자열을 넣어주세요.',
			'.env.local.example 을 복사해서 쓰시면 됩니다.',
			'',
			'값 찾는 곳:',
			'  Supabase → 프로젝트 → 위쪽 Connect 버튼',
			'  → Session pooler 의 URI 를 복사',
			'  → [YOUR-PASSWORD] 자리에 프로젝트 만들 때 정한 비밀번호를 넣기',
		);
	}

	if (url.includes('[YOUR-PASSWORD]') || url.includes('[PASSWORD]')) {
		fail(
			'접속 문자열에 비밀번호가 아직 안 들어가 있습니다.',
			'',
			`지금 값: ${mask(url)}`,
			'',
			'[YOUR-PASSWORD] 부분을 실제 비밀번호로 바꿔주세요.',
			'비밀번호를 잊으셨으면 Supabase → Settings → Database 에서 새로 정할 수 있습니다.',
		);
	}

	return url;
}

// 화면이나 로그에 접속 문자열을 그대로 찍지 않기 위한 것
export function mask(url) {
	return String(url).replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
}

// ── Postgres 연결 ────────────────────────────────────────────

export async function connect() {
	let pg;
	try {
		pg = await import('pg');
	} catch {
		fail(
			'pg 라이브러리가 설치되어 있지 않습니다.',
			'',
			'터미널에서 이것만 실행해주세요:',
			'  npm install',
		);
	}

	const client = new pg.default.Client({
		connectionString: requireDbUrl(),
		// Supabase는 SSL을 씁니다. 인증서 검증까지는 하지 않습니다.
		ssl: { rejectUnauthorized: false },
		application_name: 'hsk3-prep',
	});

	try {
		await client.connect();
	} catch (err) {
		fail(
			'데이터베이스에 연결하지 못했습니다.',
			'',
			`에러: ${err.message}`,
			'',
			'확인할 것:',
			'  · 비밀번호가 맞는지 (특수문자가 있으면 URL 인코딩이 필요할 수 있습니다)',
			'  · Supabase 프로젝트가 일시정지(paused) 상태는 아닌지',
			'  · Session pooler 주소를 썼는지 (Direct connection 은 IPv6만 되는 경우가 있습니다)',
		);
	}

	return client;
}

// ── CSV 읽기 ─────────────────────────────────────────────────
// 따옴표로 감싼 칸과 칸 안의 줄바꿈까지 처리합니다.

export function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = '';
	let inQuotes = false;

	const src = text.replace(/^﻿/, ''); // 엑셀이 붙이는 BOM 제거

	for (let i = 0; i < src.length; i++) {
		const ch = src[i];

		if (inQuotes) {
			if (ch === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
			continue;
		}

		if (ch === '"') {
			inQuotes = true;
		} else if (ch === ',') {
			row.push(field);
			field = '';
		} else if (ch === '\n') {
			row.push(field);
			rows.push(row);
			row = [];
			field = '';
		} else if (ch !== '\r') {
			field += ch;
		}
	}

	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
	if (nonEmpty.length === 0) return [];

	const header = nonEmpty[0].map((h) => h.trim());

	return nonEmpty.slice(1).map((cells, idx) => {
		if (cells.length !== header.length) {
			throw new Error(
				`${idx + 2}번째 줄의 칸 수가 안 맞습니다. ` +
					`머리글은 ${header.length}칸인데 이 줄은 ${cells.length}칸입니다.\n` +
					`값 안에 쉼표가 들어갔을 가능성이 큽니다: ${cells.join(' | ').slice(0, 120)}`,
			);
		}
		return Object.fromEntries(header.map((h, i) => [h, cells[i].trim()]));
	});
}

// ── 화면 출력 ────────────────────────────────────────────────

export const say = (...lines) => console.log(lines.join('\n'));

export function fail(...lines) {
	console.error('\n✗ ' + lines.join('\n  ') + '\n');
	process.exit(1);
}

export function done(...lines) {
	console.log('\n✓ ' + lines.join('\n  ') + '\n');
}
