#!/usr/bin/env node
/**
 * scripts/check-syntax.js
 *
 * 변경된 JavaScript 파일의 순수 구문 오류(SyntaxError)를 사전에 감지하는 가벼운 가드.
 * 외부 라이브러리/린터 의존성 없이 Node.js 내장 `node --check`를 사용한다.
 *
 * 연동:
 * - Antigravity: .agents/hooks.json의 "Stop" 이벤트
 * - Claude Code: .claude/settings.json의 "PostToolUse" 이벤트
 *
 * 원칙:
 * - 오류 발생 시 항상 fail-open (allow / exit 0) — 가드 오류가 세션을 중단시키지 않는다.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function getChangedJsFiles() {
  try {
    const output = execSync("git status --porcelain", {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    });

    const files = [];
    for (const line of output.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // 상태 코드(2자리) 뒤의 파일 경로 추출
      const filePath = trimmed.slice(2).trim().replace(/^"|"$/g, "");
      if (/\.(js|mjs|cjs)$/.test(filePath)) {
        // 삭제된 파일이나 외부 디렉터리 제외
        const fullPath = path.join(ROOT, filePath);
        if (
          fs.existsSync(fullPath) &&
          !filePath.includes("node_modules") &&
          !filePath.startsWith(".git")
        ) {
          files.push(fullPath);
        }
      }
    }
    return files;
  } catch {
    return [];
  }
}

function checkSyntax(files) {
  const errors = [];
  for (const file of files) {
    try {
      execSync(`node --check "${file}"`, {
        cwd: ROOT,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e) {
      const stderr = (e.stderr || e.message || "").trim();
      const relPath = path.relative(ROOT, file).replace(/\\/g, "/");
      errors.push(`- ${relPath}:\n  ${stderr.split("\n").slice(0, 3).join("\n  ")}`);
    }
  }
  return errors;
}

function main() {
  if (process.argv.includes("--report")) {
    const files = getChangedJsFiles();
    if (!files.length) {
      console.log("검사 대상 JS 파일 없음");
      process.exit(0);
    }
    const errors = checkSyntax(files);
    if (errors.length) {
      console.log(`구문 오류 발견 (${errors.length}건):\n${errors.join("\n")}`);
      process.exit(1);
    } else {
      console.log(`구문 검사 통과 (${files.length}개 파일)`);
      process.exit(0);
    }
  }

  let input = "";
  process.stdin.setEncoding("utf8");

  process.stdin.on("data", (chunk) => {
    input += chunk;
  });

  process.stdin.on("end", () => {
    try {
      let payload = {};
      if (input.trim()) {
        try {
          payload = JSON.parse(input);
        } catch {
          payload = {};
        }
      }

      // 검사 대상 파일 추출
      let targetFiles = [];

      // Claude Code PostToolUse 인풋 (payload.tool_input.file_path 등)
      if (payload?.tool_input?.file_path) {
        const fp = path.resolve(ROOT, payload.tool_input.file_path);
        if (/\.(js|mjs|cjs)$/.test(fp) && fs.existsSync(fp)) {
          targetFiles.push(fp);
        }
      }

      // 파일 지정이 없으면 git 변경 파일 전체 검사
      if (!targetFiles.length) {
        targetFiles = getChangedJsFiles();
      }

      const errors = targetFiles.length ? checkSyntax(targetFiles) : [];

      // 1. Antigravity Stop 훅 응답 형태
      if (payload.terminationReason !== undefined || payload.executionNum !== undefined) {
        if (errors.length > 0) {
          process.stdout.write(
            JSON.stringify({
              decision: "continue",
              reason: `[SyntaxGuard] 수정된 JavaScript 파일에 구문 오류가 있습니다. 종료 전 수정하세요:\n${errors.join(
                "\n"
              )}`,
            })
          );
        } else {
          process.stdout.write(JSON.stringify({ decision: "allow" }));
        }
        process.exit(0);
      }

      // 2. Claude Code PostToolUse 응답 형태
      if (errors.length > 0) {
        process.stdout.write(
          JSON.stringify({
            hookSpecificOutput: {
              hookEventName: "PostToolUse",
              additionalContext: `[SyntaxGuard] JavaScript 구문 오류(SyntaxError)가 감지되었습니다:\n${errors.join(
                "\n"
              )}`,
            },
          })
        );
      } else {
        process.stdout.write(JSON.stringify({}));
      }
      process.exit(0);
    } catch {
      // 오류 시 무조건 fail-open
      process.stdout.write(JSON.stringify({ decision: "allow" }));
      process.exit(0);
    }
  });
}

main();
