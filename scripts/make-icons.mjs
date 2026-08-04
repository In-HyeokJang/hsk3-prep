// PWA 아이콘(PNG)을 직접 그립니다.
//
//   npm run icons
//
// 왜 직접 그리나:
//   아이콘 이미지를 어디선가 받아오면 그게 또 하나의 의존성이 됩니다.
//   이 앱의 아이콘은 田字格(한자 연습장 칸) 모양이라 사각형만으로 그릴 수 있어서,
//   그냥 픽셀을 직접 찍는 편이 깔끔합니다.
//
// 만드는 것:
//   web/public/icon-192.png      홈 화면 아이콘
//   web/public/icon-512.png      스플래시 화면
//   web/public/icon-maskable.png 안드로이드 적응형 아이콘 (안쪽 60%에만 그림)
//   web/public/apple-touch-icon.png  아이폰

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, say, done } from './lib.mjs';

// ── PNG 만들기 (라이브러리 없이) ─────────────────────────────

const crcTable = (() => {
	const t = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c;
	}
	return t;
})();

function crc32(buf) {
	let c = -1;
	for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

function toPng(width, height, rgba) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // 비트 깊이
	ihdr[9] = 6; // RGBA
	// 10~12 은 0 (압축·필터·인터레이스 기본값)

	// 줄마다 앞에 필터 바이트 0 을 붙입니다
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (width * 4 + 1)] = 0;
		rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
	}

	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

// ── 그리기 ───────────────────────────────────────────────────

const INK = [31, 107, 79]; // #1F6B4F 짙은 초록 (먹색 대신)
const PAPER = [245, 247, 243]; // #F5F7F3

function draw(size, { inset = 0.16, radius = true } = {}) {
	const px = Buffer.alloc(size * size * 4);
	const set = (x, y, [r, g, b], a = 255) => {
		if (x < 0 || y < 0 || x >= size || y >= size) return;
		const i = (y * size + x) * 4;
		px[i] = r;
		px[i + 1] = g;
		px[i + 2] = b;
		px[i + 3] = a;
	};
	const rect = (x0, y0, w, h, color) => {
		for (let y = Math.round(y0); y < Math.round(y0 + h); y++)
			for (let x = Math.round(x0); x < Math.round(x0 + w); x++) set(x, y, color);
	};

	// 바탕
	const r = radius ? Math.round(size * 0.22) : 0;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			if (r > 0) {
				// 모서리를 둥글게
				const cx = x < r ? r : x >= size - r ? size - r - 1 : x;
				const cy = y < r ? r : y >= size - r ? size - r - 1 : y;
				const d = Math.hypot(x - cx, y - cy);
				if (d > r) continue;
			}
			set(x, y, INK);
		}
	}

	// 田字格 — 한자 연습장 칸
	const pad = size * inset;
	const box = size - pad * 2;
	const line = Math.max(2, Math.round(size * 0.028));

	// 바깥 네모
	rect(pad, pad, box, line, PAPER);
	rect(pad, pad + box - line, box, line, PAPER);
	rect(pad, pad, line, box, PAPER);
	rect(pad + box - line, pad, line, box, PAPER);

	// 가운데 십자 (점선)
	const mid = pad + box / 2 - line / 2;
	const dash = Math.round(box / 13);
	for (let i = 0; i < box; i += dash * 2) {
		const len = Math.min(dash, box - i);
		rect(pad + i, mid, len, line, PAPER);
		rect(mid, pad + i, line, len, PAPER);
	}

	return toPng(size, size, px);
}

// ── 저장 ─────────────────────────────────────────────────────

const outDir = path.join(ROOT, 'web', 'public');
fs.mkdirSync(outDir, { recursive: true });

const files = [
	['icon-192.png', draw(192)],
	['icon-512.png', draw(512)],
	// 적응형 아이콘은 바깥이 잘릴 수 있어서 안쪽에만 그립니다
	['icon-maskable.png', draw(512, { inset: 0.27, radius: false })],
	['apple-touch-icon.png', draw(180)],
];

for (const [name, buf] of files) {
	fs.writeFileSync(path.join(outDir, name), buf);
	say(`  ${name.padEnd(24)} ${(buf.length / 1024).toFixed(1)} KB`);
}

done('아이콘을 만들었습니다.', '', `저장 위치: web/public/`);
