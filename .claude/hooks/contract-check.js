#!/usr/bin/env node
// PostToolUse notifier for Edit|Write: 이 킷의 규칙 문서들 사이에 생긴
// 기계적으로 판정 가능한 모순만 검사한다. 절대 차단하지 않는다(항상 exit 0) —
// 결과는 additionalContext로 모델에게 전달되고, 사람 판단이 필요한 항목은
// docs/KitFeedback.md에 기록한다.
//
// 단독 실행: node .claude/hooks/contract-check.js --report
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const AGENTS_DIR = path.join(ROOT, ".claude", "agents");
const SKILLS_DIR = path.join(ROOT, ".agents", "skills");
const AGENTS_MD = path.join(ROOT, "AGENTS.md");

const read = (p) => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
};
const listDirs = (p) => {
  try {
    return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
};
const listFiles = (p, ext) => {
  try {
    return fs.readdirSync(p).filter((f) => f.endsWith(ext));
  } catch {
    return [];
  }
};

// C1: .claude/agents/*.md 의 frontmatter name 이 파일명과 같고, AGENTS.md 에 등재돼 있는가
function checkAgentRoster(findings) {
  const agentsMd = read(AGENTS_MD);
  for (const file of listFiles(AGENTS_DIR, ".md")) {
    const base = file.replace(/\.md$/, "");
    const body = read(path.join(AGENTS_DIR, file));
    if (!body) continue;
    const m = body.match(/^---[\s\S]*?\nname:\s*([^\n]+)/);
    const name = m ? m[1].trim() : null;
    if (!name) {
      findings.push(`C1 ${file}: frontmatter에 name 이 없다.`);
    } else if (name !== base) {
      findings.push(`C1 ${file}: frontmatter name "${name}" 이 파일명 "${base}" 과 다르다.`);
    }
    // "docs/" 경로 표기 때문에 docs 에이전트 검사가 항상 통과하는 것을 방지:
    // 경로 접두사를 제거한 본문에서 이름을 찾는다.
    const rosterSource = agentsMd ? agentsMd.replace(/docs\//g, " ") : null;
    if (rosterSource && name && !rosterSource.includes(name)) {
      findings.push(`C1 AGENTS.md: 에이전트 "${name}" 이 어디에도 등재되지 않았다.`);
    }
  }
}

// C2: 문서들이 참조하는 docs/*.md 와 .agents/skills/*/SKILL.md 가 실제로 존재하는가
function checkReferences(findings) {
  const targets = [AGENTS_MD, path.join(ROOT, "README.md"), path.join(ROOT, "CLAUDE.md")]
    .concat(listFiles(AGENTS_DIR, ".md").map((f) => path.join(AGENTS_DIR, f)))
    .concat(listFiles(path.join(ROOT, "docs"), ".md").map((f) => path.join(ROOT, "docs", f)));

  for (const file of targets) {
    const body = read(file);
    if (!body) continue;
    const rel = path.relative(ROOT, file).replace(/\\/g, "/");
    for (const ref of body.match(/docs\/[A-Za-z0-9_-]+\.md/g) || []) {
      if (!fs.existsSync(path.join(ROOT, ref))) findings.push(`C2 ${rel}: 존재하지 않는 문서 참조 "${ref}"`);
    }
    for (const ref of body.match(/\.agents\/skills\/[a-z0-9-]+\/SKILL\.md/g) || []) {
      if (!fs.existsSync(path.join(ROOT, ref))) findings.push(`C2 ${rel}: 존재하지 않는 스킬 참조 "${ref}"`);
    }
  }
}

// C3: .agents/skills 의 실제 스킬이 AGENTS.md 공용 스킬 표에 등재돼 있는가 (양방향)
function checkSkillRoster(findings) {
  const agentsMd = read(AGENTS_MD);
  if (!agentsMd) return;
  for (const dir of listDirs(SKILLS_DIR)) {
    if (!fs.existsSync(path.join(SKILLS_DIR, dir, "SKILL.md"))) {
      findings.push(`C3 .agents/skills/${dir}: SKILL.md 가 없다.`);
      continue;
    }
    if (!agentsMd.includes(dir)) findings.push(`C3 AGENTS.md: 스킬 "${dir}" 이 공용 스킬 표에 없다.`);
  }
}

// C4: 소유권 표에서 한 문서에 소유자가 둘 이상 지정되지 않았는가
function checkOwnership(findings) {
  const agentsMd = read(AGENTS_MD);
  if (!agentsMd) return;
  const section = agentsMd.split("## 문서 소유권")[1];
  if (!section) {
    findings.push(`C4 AGENTS.md: "## 문서 소유권" 절을 찾을 수 없다.`);
    return;
  }
  const owners = new Map();
  for (const line of section.split("\n")) {
    if (line.trim().startsWith("## ")) break; // 다음 절 시작 — 소유권 표 종료
    const cells = line.split("|").map((c) => c.trim());
    if (cells.length < 4 || !cells[1] || cells[1].startsWith("-") || cells[1] === "문서") continue;
    for (const doc of cells[1].split(",").map((d) => d.trim()).filter(Boolean)) {
      if (owners.has(doc) && owners.get(doc) !== cells[2]) {
        findings.push(`C4 AGENTS.md 소유권: "${doc}" 에 소유자가 둘이다 ("${owners.get(doc)}", "${cells[2]}").`);
      }
      owners.set(doc, cells[2]);
    }
  }
}

// C5: init 스크립트가 치환하지 않는 위치의 플레이스홀더
// (scripts/init.* 의 치환 대상은 README.md 와 docs/**.md 뿐이다.
//  그 밖의 파일에 {{...}} 를 두면 새 프로젝트에서 영원히 치환되지 않는다.)
function checkPlaceholders(findings) {
  const SKIP = new Set([".git", "node_modules", "docs", ".vscode"]);
  const PATTERN = /\{\{[A-Z0-9_]+\}\}/;
  const walk = (dir) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      const rel = path.relative(ROOT, full).replace(/\\/g, "/");
      if (e.isDirectory()) {
        if (!SKIP.has(e.name)) walk(full);
        continue;
      }
      if (rel === "README.md" || rel.startsWith("docs/")) continue; // init 치환 대상
      if (!/\.(md|json|js|ps1|sh|ya?ml)$/.test(e.name)) continue;
      // 치환을 수행하는 쪽(스크립트·훅)은 플레이스홀더를 검색 문자열로 담고 있으므로 제외
      if (rel.startsWith(".claude/hooks/") || rel.startsWith("scripts/")) continue;
      const body = read(full);
      if (body && PATTERN.test(body)) {
        findings.push(`C5 ${rel}: init 스크립트가 치환하지 않는 위치에 플레이스홀더가 있다 (치환 대상은 README.md 와 docs/ 뿐).`);
      }
    }
  };
  walk(ROOT);
}

// C6: 훅 설정이 가리키는 스크립트가 실재하는가
// (경로가 틀리면 훅이 조용히 무동작 = 보호가 사라진 줄 모르는 최악의 실패 모드)
function checkHookWiring(findings) {
  const claudeSettings = read(path.join(ROOT, ".claude", "settings.json"));
  if (claudeSettings) {
    for (const m of claudeSettings.matchAll(/node\s+([.\w/\\-]+\.js)/g)) {
      if (!fs.existsSync(path.join(ROOT, m[1]))) {
        findings.push(`C6 .claude/settings.json: 훅 스크립트 "${m[1]}" 이 없다.`);
      }
    }
  }
  const codexHooks = read(path.join(ROOT, ".codex", "hooks.json"));
  if (codexHooks) {
    for (const m of codexHooks.matchAll(/node\s+([.\w/\\-]+\.js)/g)) {
      if (!fs.existsSync(path.join(ROOT, m[1]))) {
        findings.push(`C6 .codex/hooks.json: 훅 스크립트 "${m[1]}" 이 없다.`);
      }
    }
  }
  const agyHooks = read(path.join(ROOT, ".agents", "hooks.json"));
  if (agyHooks) {
    // command 안에서 참조하는 .js 경로를 모두 뽑아 하나라도 실재하는지 확인
    // (경로가 틀려도 훅은 조용히 통과하므로 기계 검사가 유일한 탐지 수단)
    const refs = [...agyHooks.matchAll(/([\w.][\w./\\-]*\.js)\b/g)].map((m) => m[1]);
    if (refs.length) {
      const anyExists = refs.some((r) => fs.existsSync(path.join(ROOT, r.replace(/^\.\.[/\\]/, ""))));
      if (!anyExists) {
        findings.push(`C6 .agents/hooks.json: 참조 스크립트를 찾을 수 없다 (${refs.join(", ")}).`);
      }
    }
  }
}

function runChecks() {
  const findings = [];
  try {
    checkAgentRoster(findings);
    checkReferences(findings);
    checkSkillRoster(findings);
    checkOwnership(findings);
    checkPlaceholders(findings);
    checkHookWiring(findings);
  } catch (e) {
    return [`검사 중 오류(fail-open): ${e.message}`];
  }
  return findings;
}

if (process.argv.includes("--report")) {
  const findings = runChecks();
  console.log(findings.length ? findings.join("\n") : "모순 없음");
  process.exit(0);
}

const WATCHED = [
  ".claude/agents/",
  ".agents/skills/",
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "docs/",
  ".claude/settings.json",
  ".codex/hooks.json",
  ".agents/hooks.json",
];
const { readHookInput } = require("./lib/read-hook-input");

readHookInput((payload) => {
  const file = payload?.tool_input?.file_path;
  if (typeof file !== "string") process.exit(0);
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (!WATCHED.some((w) => rel.startsWith(w))) process.exit(0);

  const findings = runChecks();
  if (findings.length) {
    console.log(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext:
            "규칙 문서 정합성 검사에서 모순이 발견됐다. 지금 작업과 무관하면 무시하되, 방금 편집이 원인이면 고쳐라:\n" +
            findings.join("\n"),
        },
      })
    );
  }
  process.exit(0);
});
