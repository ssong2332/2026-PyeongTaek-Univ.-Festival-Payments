#!/usr/bin/env node
// PreToolUse 가드 (Bash): 훅·서명을 우회하는 git 플래그를 차단한다.
// docs/GitWorkflow.md 금지 조항("--no-verify 등 훅 우회 금지")을 강제한다.
const { readHookInput } = require("./lib/read-hook-input");

readHookInput((payload) => {
  const command = payload?.tool_input?.command;
  if (typeof command !== "string" || !/\bgit\b/.test(command)) process.exit(0);

  const skipPatterns = [
    /--no-verify\b/,
    /--no-gpg-sign\b/,
    // git commit -n / -nm / -mn 등: -n은 --no-verify 단축형이고 짧은 플래그는
    // 묶어 쓸 수 있다(-nm = -n -m). commit의 실제 짧은 플래그(aceCimnopqsSuvF)로만
    // 구성된 묶음에 n이 포함되면 차단 — 2026-08-18 회귀 스위트 작성 중 "-nm"이
    // 기존 `\s-n\b`(정확히 -n만) 패턴을 통과하는 것을 발견해 넓혔다.
    /\bcommit\b[^\n]*\s-[aceCimnopqsSuvF]*n[aceCimnopqsSuvF]*\b/,
    /-c\s*commit\.gpgsign=false\b/,
    /-c\s*core\.hooksPath=/,
    /\bconfig\b[^\n]*core\.hooksPath\b/, // git config core.hooksPath <경로> (영구 설정, "=" 없음)
  ];
  const hit = skipPatterns.find((p) => p.test(command));
  if (hit) {
    console.error(
      `차단: 훅/서명을 우회하는 git 플래그 (${hit}) — docs/GitWorkflow.md: 훅 우회 금지. 사용자가 이번 턴에 이 명령을 명시적으로 요청한 경우에만 예외.`
    );
    process.exit(2);
  }

  process.exit(0);
});
