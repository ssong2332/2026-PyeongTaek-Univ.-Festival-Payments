// CI-only native PostgreSQL race check. No production credentials or Supabase project.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
if (process.env.PGHOST !== '127.0.0.1' || process.env.PGDATABASE !== 'festival_load_test') {
  throw new Error('Dedicated localhost festival_load_test database required');
}
const sql = async (query) => (await exec('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-Atc', query])).stdout.trim();
await sql(`
  INSERT INTO public.menu_items(id,base_price,stock) VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',1000,10);
  SELECT public.load_test_prepare('aabbccdd');
  UPDATE public.menu_items SET stock=9 WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  INSERT INTO public.counters(key,value) VALUES('pickup_number',1);
  INSERT INTO public.orders(id,pickup_number,payment_method,total_amount,idempotency_key,status_token)
    VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1,'cash',1000,'00000000-0000-4a29-8000-aabbccdd0000','race-token');
  INSERT INTO public.order_items(order_id,menu_item_id,menu_name_ko,unit_price,quantity,line_total)
    VALUES('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','race',1000,1,1000);
`);
const results = await Promise.all([
  sql("SELECT public.load_test_cleanup('aabbccdd',false)"),
  sql("SELECT public.load_test_cleanup('aabbccdd',false)"),
]);
if (results.filter(r => JSON.parse(r).alreadyCleaned).length !== 1) throw new Error('Concurrent retry did not serialize');
if (await sql("SELECT stock FROM public.menu_items WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'") !== '10') throw new Error('Double restoration');
if (await sql('SELECT count(*) FROM public.orders') !== '0') throw new Error('Orders remain');
if (await sql("SELECT count(*) FROM public.counters WHERE key='pickup_number'") !== '0') throw new Error('Counter not restored');
console.log('PASS native concurrent cleanup: exactly one restoration');
