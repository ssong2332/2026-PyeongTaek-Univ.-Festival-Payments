import { createClient } from '@supabase/supabase-js';
import { assertLocalTarget, assertRunId } from './safety.js';

// Deliberately does not load .env.local or accept remote overrides.
async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--prepare', '--dry-run'].includes(arg)) ||
      (args.includes('--prepare') && args.includes('--dry-run'))) {
    throw new Error('Use --prepare, --dry-run, or no arguments. Stock restoration is mandatory.');
  }
  const url = process.env.LOAD_TEST_SUPABASE_URL;
  assertLocalTarget(url, process.env.LOAD_TEST_ISOLATED);
  const run = process.env.LOAD_TEST_RUN_ID;
  assertRunId(run);
  const key = process.env.LOAD_TEST_SERVICE_ROLE_KEY;
  if (!key) throw new Error('LOAD_TEST_SERVICE_ROLE_KEY is required (local disposable database only).');
  console.log(`T-29 database: ${url}; run: ${run}; mode: ${args.join(' ') || 'cleanup'}`);
  const client = createClient(url, key, { auth: { persistSession: false } });
  const prepare = args.includes('--prepare');
  const { data, error } = await client.rpc(prepare ? 'load_test_prepare' : 'load_test_cleanup', {
    p_run: run,
    ...(prepare ? {} : { p_dry_run: args.includes('--dry-run') }),
  });
  if (error) throw new Error(error.message);
  console.log(JSON.stringify(data, null, 2));
}

main().catch((error) => {
  console.error(`[T-29 aborted] ${error.message}`);
  process.exitCode = 1;
});
