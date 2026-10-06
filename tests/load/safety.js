// Shared with k6: strict literal allowlist, without DNS or URL normalization.
export function assertLocalTarget(url, isolated) {
  if (isolated !== 'YES' || typeof url !== 'string' ||
      !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):[1-9][0-9]{0,4}$/.test(url)) {
    throw new Error('T-29 requires LOAD_TEST_ISOLATED=YES and an explicit loopback HTTP URL with port. Remote targets are forbidden.');
  }
}

export function assertRunId(run) {
  if (!/^[0-9a-f]{8}$/.test(run || '')) throw new Error('LOAD_TEST_RUN_ID must be 8 lowercase hex digits from a fresh prepared run.');
}

export function clientIp(iteration) {
  return `198.18.0.${1 + iteration % 60}`;
}

export function runKey(run, iteration) {
  assertRunId(run);
  if (!Number.isInteger(iteration) || iteration < 0 || iteration > 65535) throw new Error('Iteration out of range');
  return `00000000-0000-4a29-8000-${run}${iteration.toString(16).padStart(4, '0')}`;
}
