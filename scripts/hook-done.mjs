// 작업이 끝나면 알려줍니다.
//
// 이 파일은 직접 실행하지 않습니다. `.claude/settings.json` 이 불러줍니다.
//
// 왜 필요한가:
//   Claude 가 오래 걸리는 일을 하는 동안 다른 창을 보고 있으면
//   언제 끝났는지 모릅니다. 소리로 한 번 알려줍니다.
//
//   그리고 **아직 커밋 안 한 파일이 있는지**를 같이 말해줍니다.
//   고쳐놓고 커밋을 안 한 채로 다음 작업에 들어가면,
//   나중에 무엇이 어느 커밋에 들어갔는지 알 수 없게 됩니다.

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 터미널 종소리. 화면에 찍히면 안 되니 stderr 로 보냅니다
// (stdout 은 아래 JSON 만 담아야 합니다).
process.stderr.write('\x07');

let message = '작업이 끝났습니다.';

try {
	const changed = execSync('git status --porcelain', {
		cwd: ROOT,
		stdio: 'pipe',
		encoding: 'utf8',
	})
		.split('\n')
		.filter((line) => line.trim() !== '').length;

	message =
		changed > 0
			? `작업이 끝났습니다. 아직 커밋 안 한 파일이 ${changed}개 있습니다.`
			: '작업이 끝났습니다. 커밋 안 한 파일은 없습니다.';
} catch {
	// 깃 저장소가 아니거나 깃이 없어도 알림은 떠야 합니다
}

process.stdout.write(JSON.stringify({ systemMessage: message }));
