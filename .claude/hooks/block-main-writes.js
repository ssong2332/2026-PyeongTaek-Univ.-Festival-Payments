#!/usr/bin/env node
// PreToolUse 가드 (Bash): main/master 체크아웃 상태의 `git commit`과,
// 다른 브랜치를 병합 없이 main/master ref에 직접 써넣는 refspec push를 차단한다.
// docs/GitWorkflow.md("main 직접 커밋 금지, main은 병합으로만 갱신")를 강제한다.
//
// 의도적으로 막지 않는 것: main에서의 평범한 `git push` / `git push origin main`.
// 병합을 마친 사용자·메인 세션의 정상적인 마지막 단계이기 때문이다(docs/GitWorkflow.md 병합 절).
// 리뷰를 우회해 main에 새 내용을 실을 수 있는 경로는 커밋뿐이므로, 커밋을 막으면
// 같은 브랜치 push는 이미 병합을 거친 이력만 나른다.
//
// 한계: 브랜치 판정은 명령 실행 전 HEAD 기준이다. `git checkout main && git commit`
// 같은 복합 명령은 판정을 비껴간다 — 명령을 나눠 실행할 것(.claude/hooks/README.md).
const { readHookInput } = require("./lib/read-hook-input");

readHookInput((payload) => {
  const command = payload?.tool_input?.command;
  if (typeof command !== "string") process.exit(0);

  const isCommit = /\bgit\s+commit\b/.test(command);
  // 예: "git push origin fix/x:main", "git push origin HEAD:refs/heads/master",
  //     "git push origin +fix/x:main" (강제), "git push origin 'fix/x:main'" (인용부호).
  // dst 뒤 (?=["'\s]|$) 는 "feature:main-fix" 같은 하이픈 붙은 브랜치를 오탐하지 않기 위함.
  const refspec = command.match(
    /\bgit\s+push\b[^\n]*\s["'+]?([\w./-]+):(?:refs\/heads\/)?(main|master)(?=["'\s]|$)/
  );
  if (!isCommit && !refspec) process.exit(0);

  const { execSync } = require("child_process");
  let branch = "";
  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
  } catch {
    process.exit(0); // git 리포가 아니거나 커밋이 없음 — 보호 대상 없음 (fail-open)
  }
  const onProtectedBranch = branch === "main" || branch === "master";

  if (isCommit && onProtectedBranch) {
    console.error(
      `차단: "${branch}" 체크아웃 상태에서 git commit — docs/GitWorkflow.md: main 직접 커밋 금지. feat/fix 브랜치를 먼저 만들 것.`
    );
    process.exit(2);
  }

  if (refspec) {
    const src = refspec[1];
    const srcIsProtected = /^(refs\/heads\/)?(main|master)$/.test(src);
    const srcIsHeadOnProtected = src === "HEAD" && onProtectedBranch;
    if (!srcIsProtected && !srcIsHeadOnProtected) {
      console.error(
        `차단: refspec push가 다른 브랜치를 병합 없이 main/master에 직접 써넣는다 — docs/GitWorkflow.md: main은 병합으로만 갱신. 로컬에서 병합한 뒤 push할 것.`
      );
      process.exit(2);
    }
  }

  process.exit(0);
});
