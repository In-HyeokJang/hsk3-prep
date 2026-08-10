// main 브랜치에 올리는 것을 막습니다.
//
// 이 파일은 직접 실행하지 않습니다. `.claude/settings.json` 이 불러줍니다.
//
// 왜 필요한가:
//   이 프로젝트는 `dev` 에만 올리기로 정해져 있습니다 (docs/14-wbs3.md 의 진행 규칙).
//   Vercel 이 `dev` 를 보고 배포하므로 `main` 에 올릴 이유가 없고,
//   실수로 올리면 되돌리는 데 손이 많이 갑니다.
//
//   스킬 문서에 "main 에 올리지 마세요" 라고 적어두는 것만으로는 부족합니다.
//   글로 적은 규칙은 지켜지지 않을 때가 있지만, 이 훅은 실제로 막습니다.
//   ('화면에 없다는 것은 막았다는 뜻이 아니다' — 이 프로젝트가 이미 겪은 교훈)
//
// 무엇을 막나:
//   · main 으로 푸시 (`git push origin main` · `git push -u origin HEAD:main` 등)
//   · 강제 푸시 (`--force`, `-f`) — 남의 기록을 지웁니다
//
// 무엇을 안 막나:
//   · `git push origin dev` (정상)
//   · `git push` (지금 브랜치가 dev 면 그대로 통과)

/** 들어온 JSON 을 다 읽습니다 */
async function readInput() {
	let text = '';
	for await (const chunk of process.stdin) text += chunk;
	try {
		return JSON.parse(text);
	} catch {
		return {};
	}
}

/** 막을 때 돌려주는 답 */
function deny(reason) {
	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'deny',
				permissionDecisionReason: reason,
			},
		}),
	);
	process.exit(0);
}

const input = await readInput();
const command = input?.tool_input?.command ?? '';

// 푸시가 아니면 아무것도 하지 않습니다
if (!/\bgit\s+push\b/.test(command)) process.exit(0);

// ── 강제 푸시 ──
// 되돌릴 수 없습니다. 사장님이 직접 시켰을 때만 터미널에서 하셔야 합니다.
if (/\s(--force|--force-with-lease|-f)\b/.test(command)) {
	deny(
		'강제 푸시(--force)를 막았습니다.\n' +
			'이미 올라간 기록을 덮어써서 되돌릴 수 없습니다.\n' +
			'정말 필요하면 사장님이 터미널에서 직접 하셔야 합니다.',
	);
}

// ── main 으로 푸시 ──
// `git push origin main` · `git push origin HEAD:main` · `git push origin dev:main` 을 다 잡습니다.
if (/\bgit\s+push\b[^\n;&|]*\b(main|master)\b/.test(command)) {
	deny(
		'main 에 올리는 것을 막았습니다.\n' +
			'이 프로젝트는 dev 에만 올립니다 (docs/14-wbs3.md 의 진행 규칙).\n' +
			'Vercel 이 dev 를 보고 배포하므로 main 에 올릴 이유가 없습니다.\n\n' +
			'이렇게 하세요:  git push origin dev',
	);
}

process.exit(0);
