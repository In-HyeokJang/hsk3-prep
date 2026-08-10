// 커밋하기 전에 빌드를 돌려보고, 실패하면 커밋을 막습니다.
//
// 이 파일은 직접 실행하지 않습니다. `.claude/settings.json` 이 불러줍니다.
// (Claude Code 의 '훅' — 어떤 일이 일어나기 전후에 자동으로 도는 것)
//
// 왜 필요한가:
//   빌드가 깨진 채로 커밋되면 그 커밋으로 되돌려도 사이트가 안 뜹니다.
//   나중에 "언제부터 안 됐지" 를 찾을 때 성한 커밋이 없으면 손을 못 씁니다.
//   커밋 하나하나가 되돌아갈 수 있는 자리여야 합니다.
//
// 어떻게 도나:
//   Claude 가 명령을 실행하기 전에, 그 명령이 무엇인지 JSON 으로 받습니다.
//   'git commit' 이 들어 있을 때만 빌드를 돌립니다. 나머지는 그냥 지나갑니다.
//   실패하면 "막아라" 라는 답을 돌려줍니다.

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const input = await readInput();
const command = input?.tool_input?.command ?? '';

// 커밋이 아니면 아무것도 하지 않습니다.
// 'git add ... && git commit ...' 처럼 붙여 쓴 것도 잡으려고 통째로 찾습니다.
if (!command.includes('git commit')) process.exit(0);

try {
	execSync('npm run build', { cwd: ROOT, stdio: 'pipe', encoding: 'utf8' });
	// 통과했으면 조용히 지나갑니다. 커밋할 때마다 "빌드 됐어요" 가 뜨면 시끄럽습니다.
	process.exit(0);
} catch (err) {
	// 무엇이 잘못됐는지 끝부분만 보여줍니다. 전부 붙이면 화면을 뒤덮습니다.
	const output = `${err.stdout ?? ''}${err.stderr ?? ''}`.trimEnd();
	const tail = output.split('\n').slice(-15).join('\n');

	process.stdout.write(
		JSON.stringify({
			hookSpecificOutput: {
				hookEventName: 'PreToolUse',
				permissionDecision: 'deny',
				permissionDecisionReason:
					'빌드가 실패해서 커밋을 막았습니다.\n' +
					'고친 뒤에 다시 커밋하세요. 터미널에서 `npm run build` 로도 볼 수 있습니다.\n\n' +
					tail,
			},
		}),
	);
	process.exit(0);
}
