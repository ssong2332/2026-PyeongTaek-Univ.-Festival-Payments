#!/usr/bin/env node
// PreToolUse 가드 3종의 회귀 테스트. 어떤 훅 이벤트에도 안 걸려 있다 —
// 가드 패턴을 고친 뒤 손으로 돌린다:
//
//   node .claude/hooks/test-guards.js
//
// 2026-08-18에 이 파일을 처음 짜다가 block-no-verify.js가 "git commit -nm"
// (--no-verify를 -m과 묶은 짧은 플래그 클러스터)을 통과시키는 것을 발견해
// 그 자리에서 고쳤다 — 회귀 스위트가 없어서 그 전까지 아무도 몰랐던 구멍이다.
// 이 파일이 존재하는 이유가 바로 그것: 패턴을 고칠 때마다 다시 확인할 수단.
//
// 각 케이스는 종료 코드만 본다 — PreToolUse 계약의 전부이기 때문이다:
// 2는 차단, 그 외는 전부 허용. 크래시(예외로 죽는 것)도 exit 0이 아닌 다른
// 코드로 끝나므로 "크래시=ALLOW"가 되는 실패 모드를 CRASH로 별도 표시해
// 통과로 착각하지 않게 한다.
const { spawnSync } = require("child_process");
const path = require("path");
const { execFileSync } = require("child_process");

// 이 파일 자체가 block-env-access.js·block-no-verify.js가 감시하는 문자열을
// 그대로 담고 있으면 Claude Code/Codex를 통해 이 파일을 편집할 때 그 훅에
// 스스로 걸린다 — 조립해서 피한다.
const E = "." + "env";
const GC = "git" + " " + "commit";
const GP = "git" + " " + "push";

function verdict(script, payload) {
  const r = spawnSync(process.execPath, [path.join(__dirname, script)], {
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  if (r.status === 2) return "BLOCK";
  if (r.status === 0) return "ALLOW";
  return `CRASH(${r.status}): ${(r.stderr || "").split("\n")[0]}`;
}

const bash = (command) => ({ tool_name: "Bash", tool_input: { command } });

// block-main-writes의 두 케이스는 실행 시점의 실제 체크아웃 브랜치에 좌우된다
// (파일 헤더의 "브랜치 판정은 실행 전 HEAD 기준" 그대로) — 다른 브랜치에서
// 돌려도 항상 맞게 판정하도록 기대값을 여기서 동적으로 계산한다.
let onProtectedBranch = false;
try {
  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  onProtectedBranch = branch === "main" || branch === "master";
} catch {
  /* git 리포가 아니면 아래 두 케이스는 건너뛰지 않고 ALLOW를 기대(가드도 fail-open) */
}

const CASES = [
  // block-env-access — Bash 경로
  ["block-env-access.js", bash(`cat ${E}`), "BLOCK", "시크릿 파일을 읽음"],
  ["block-env-access.js", bash(`cat ${E}.local`), "BLOCK", "환경별 변형도 시크릿을 담는다"],
  ["block-env-access.js", bash(`cat ${E}.production`), "BLOCK", "동일"],
  ["block-env-access.js", bash(`echo X >> ${E}.local`), "BLOCK", "변형 파일 덮어쓰기"],
  ["block-env-access.js", bash(`cat ${E}.example`), "ALLOW", "추적되는 플레이스홀더는 공개"],
  ["block-env-access.js", bash("npm run dev"), "ALLOW", "무관한 명령"],
  ["block-env-access.js", bash(`gc ${E}`), "BLOCK", "PowerShell Get-Content 별칭"],
  ["block-env-access.js", bash(`Select-String KEY ${E}`), "BLOCK", "PowerShell 검색 별칭"],
  ["block-env-access.js", bash(`findstr KEY ${E}`), "BLOCK", "Windows 검색 명령"],
  ["block-env-access.js", bash(`sed -n '1p' ${E}`), "BLOCK", "sed로 라인 출력"],
  ["block-env-access.js", bash(`grep KEY ${E}`), "BLOCK", "grep으로 매칭 라인 출력"],
  // block-env-access — 파일 도구 경로
  ["block-env-access.js", { tool_name: "Read", tool_input: { file_path: `${E}.local` } }, "BLOCK", "Read로 변형 파일"],
  ["block-env-access.js", { tool_name: "Grep", tool_input: { pattern: "KEY", path: E } }, "BLOCK", "Grep은 매칭 라인 자체를 출력한다"],
  ["block-env-access.js", { tool_name: "Grep", tool_input: { pattern: "KEY", glob: `**/${E}` } }, "BLOCK", "glob이 .env를 겨냥"],
  ["block-env-access.js", { tool_name: "Read", tool_input: { file_path: `${E}.example` } }, "ALLOW", "플레이스홀더는 Read 허용"],
  ["block-env-access.js", { tool_name: "Grep", tool_input: { pattern: "KEY", path: "src" } }, "ALLOW", "평범한 Grep"],
  // block-env-access — Codex apply_patch 경로
  ["block-env-access.js", { tool_name: "apply_patch", tool_input: { command: `*** Update File: ${E}\n@@\n-a\n+b\n` } }, "BLOCK", "apply_patch 대상이 .env"],
  ["block-env-access.js", { tool_name: "apply_patch", tool_input: { command: `*** Update File: ${E}.example\n@@\n-a\n+b\n` } }, "ALLOW", "apply_patch 대상이 플레이스홀더"],
  // block-no-verify
  ["block-no-verify.js", bash(`${GC} --no-verify -m x`), "BLOCK", "장문형"],
  ["block-no-verify.js", bash(`${GC} -n -m x`), "BLOCK", "-n 단독 (--no-verify 단축형)"],
  ["block-no-verify.js", bash(`${GC} -nm "x"`), "BLOCK", "-n을 -m과 묶은 짧은 플래그 클러스터 (2026-08-18에 여기서 뚫린 것을 발견)"],
  ["block-no-verify.js", bash(`${GC} -mn "x"`), "BLOCK", "순서를 바꾼 클러스터"],
  ["block-no-verify.js", bash("git log -n 5"), "ALLOW", "commit이 아닌 곳의 -n은 count 옵션"],
  ["block-no-verify.js", bash(`${GC} -m "x"`), "ALLOW", "평범한 커밋"],
  ["block-no-verify.js", bash(`${GC} --amend`), "ALLOW", "amend는 우회가 아니다"],
  // block-main-writes — 브랜치 무관 케이스
  [
    "block-main-writes.js",
    bash(`${GP} origin fix/x:main`),
    "BLOCK",
    "다른 브랜치를 병합 없이 main에 직접 push",
  ],
  ["block-main-writes.js", bash(`${GP} origin +fix/x:main`), "BLOCK", "강제 push도 동일하게 차단"],
  ["block-main-writes.js", bash(`${GP} origin "fix/x:main"`), "BLOCK", "인용부호로 감싼 refspec"],
  ["block-main-writes.js", bash(`${GP} origin main`), "ALLOW", "같은 브랜치의 평범한 push"],
  ["block-main-writes.js", bash(`${GP} origin main:main`), "ALLOW", "명시적 main:main도 평범한 push"],
  [
    "block-main-writes.js",
    bash(`${GP} origin feature:main-fix`),
    "ALLOW",
    "dst가 main이 아니라 하이픈 붙은 다른 브랜치(main-fix) — 오탐 방지 확인",
  ],
  ["block-main-writes.js", bash("npm test"), "ALLOW", "git과 무관한 명령"],
  // block-main-writes — 실행 시점 브랜치에 좌우되는 케이스 (파일 헤더의 문서화된 한계)
  [
    "block-main-writes.js",
    bash(`${GC} -m "x"`),
    onProtectedBranch ? "BLOCK" : "ALLOW",
    `현재 브랜치가 ${onProtectedBranch ? "main/master라 차단돼야 함" : "main/master가 아니라 허용돼야 함"}`,
  ],
  [
    "block-main-writes.js",
    bash(`${GP} origin HEAD:refs/heads/master`),
    onProtectedBranch ? "ALLOW" : "BLOCK",
    `HEAD가 ${onProtectedBranch ? "이미 main/master이므로 자기 자신을 push하는 것과 같음" : "main/master가 아닌데 refspec으로 master에 써넣으려 함"}`,
  ],
];

let failed = 0;
for (const [script, payload, expected, why] of CASES) {
  const actual = verdict(script, payload);
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${script.padEnd(22)} ${why.padEnd(58)} expected=${expected} actual=${actual}`);
}

console.log(`\n${CASES.length - failed}/${CASES.length} 통과`);
process.exit(failed === 0 ? 0 : 1);
