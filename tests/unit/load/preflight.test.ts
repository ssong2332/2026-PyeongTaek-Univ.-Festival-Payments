import { beforeEach, describe, expect, it, vi } from 'vitest';
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/infra/supabase/server', () => ({ createServiceClient: () => ({ rpc }) }));
import { GET } from '@/app/api/load-test/preflight/route';

describe('load test preflight', () => {
  beforeEach(() => { vi.unstubAllEnvs(); rpc.mockReset(); });
  it('does not query a remote DB even with opt-in', async () => {
    vi.stubEnv('LOAD_TEST_ISOLATED', 'YES');
    vi.stubEnv('LOAD_TEST_RUN_ID', 'aabbccdd');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prod.supabase.co');
    expect((await GET(new Request('http://localhost:3000/api/load-test/preflight'))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects Cloudflare, missing prepare and mismatched run', async () => {
    vi.stubEnv('LOAD_TEST_ISOLATED', 'YES');
    vi.stubEnv('LOAD_TEST_RUN_ID', 'aabbccdd');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
    expect((await GET(new Request('http://localhost:3000/api/load-test/preflight', { headers: { 'cf-ray': 'test' } }))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: null, error: null });
    expect((await GET(new Request('http://localhost:3000/api/load-test/preflight'))).status).toBe(409);
    rpc.mockResolvedValue({ data: { prepared: true, run: 'ffffffff' }, error: null });
    expect((await GET(new Request('http://localhost:3000/api/load-test/preflight'))).status).toBe(409);
    rpc.mockResolvedValue({ data: { prepared: true, run: 'aabbccdd' }, error: null });
    const response = await GET(new Request('http://localhost:3000/api/load-test/preflight'));
    expect(await response.json()).toEqual({ prepared: true, run: 'aabbccdd', dbUrl: 'http://127.0.0.1:54321' });
  });
});
