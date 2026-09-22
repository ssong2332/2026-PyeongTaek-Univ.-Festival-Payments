#!/usr/bin/env node
// Reads and parses the PreToolUse JSON payload from stdin, then hands it
// to onPayload. Fail-open on a malformed payload (exit 0 — allow) rather
// than throwing: see .claude/hooks/README.md for why fail-open is this
// repo's default for guard scripts, and when a guard should override it.
function readHookInput(onPayload) {
  let input = "";
  process.stdin.on("data", (chunk) => (input += chunk));
  process.stdin.on("end", () => {
    let payload;
    try {
      payload = JSON.parse(input || "{}");
    } catch {
      process.exit(0);
    }
    onPayload(payload);
  });
}

module.exports = { readHookInput };
