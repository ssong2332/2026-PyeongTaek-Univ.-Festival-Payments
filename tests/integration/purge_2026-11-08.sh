#!/usr/bin/env bash
# Runs only against a new, disposable festival_purge_test DB.
set -euo pipefail

psql -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE festival_purge_test'
for migration in \
  0001_schema 0003_rls 0007_t03_schema_hardening 0008_t53_remove_easy_pay \
  0018_rate_limit 0102_reviews 0103_staff_calls; do
  psql -d festival_purge_test -v ON_ERROR_STOP=1 -f "supabase/migrations/${migration}.sql" >/dev/null
done
psql -d festival_purge_test -v ON_ERROR_STOP=1 -f tests/integration/purge_2026-11-08.sql >/dev/null

# Only this disposable copy bypasses the date gate, so the exact production SQL body
# can be exercised before 11-08 without weakening the checked-in production file.
node <<'NODE'
const fs = require('node:fs');
const source = fs.readFileSync('supabase/scripts/purge_2026-11-08.sql', 'utf8');
const guard = "DATE '2026-11-08'";
if (source.split(guard).length !== 2) throw new Error('Expected exactly one purge date guard');
fs.writeFileSync('/tmp/festival-purge-test.sql', source.replace(guard, "DATE '2000-01-01'"));
NODE

psql -d festival_purge_test -v ON_ERROR_STOP=1 -f /tmp/festival-purge-test.sql >/dev/null
psql -d festival_purge_test -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM public.orders)
       OR EXISTS (SELECT 1 FROM public.order_items)
       OR EXISTS (SELECT 1 FROM public.order_item_options)
       OR EXISTS (SELECT 1 FROM public.order_status_history)
       OR EXISTS (SELECT 1 FROM public.reviews)
       OR EXISTS (SELECT 1 FROM public.staff_calls)
       OR EXISTS (SELECT 1 FROM public.rate_limits)
       OR (SELECT value FROM public.counters WHERE key = 'pickup_number') IS DISTINCT FROM 0::bigint
       OR (SELECT value FROM public.counters WHERE key = 'other_counter') IS DISTINCT FROM 7::bigint
       OR (SELECT stock FROM public.menu_items WHERE id = '11111111-1111-1111-1111-111111111111') IS DISTINCT FROM 37
       OR (SELECT value FROM public.app_settings WHERE key = 'purge.test') IS DISTINCT FROM 'keep'
       OR (SELECT count(*) FROM public.options) <> 1 THEN
        RAISE EXCEPTION 'purge result or preserved data mismatch';
    END IF;
END $$;
SQL

# Re-running on empty order tables must be safe.
psql -d festival_purge_test -v ON_ERROR_STOP=1 -f /tmp/festival-purge-test.sql >/dev/null

# A new, unlisted child table must stop the purge and roll the whole transaction back.
psql -d festival_purge_test -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.orders (id, pickup_number, payment_method, total_amount, idempotency_key, status_token)
VALUES ('77777777-7777-7777-7777-777777777777', 43, 'cash', 0,
        '88888888-8888-8888-8888-888888888888', 'purge-blocked-token');
UPDATE public.counters SET value = 43 WHERE key = 'pickup_number';
CREATE TABLE public.purge_extra_child (order_id uuid REFERENCES public.orders(id));
INSERT INTO public.purge_extra_child VALUES ('77777777-7777-7777-7777-777777777777');
SQL
if psql -d festival_purge_test -v ON_ERROR_STOP=1 -f /tmp/festival-purge-test.sql >/dev/null 2>&1; then
  echo 'Unexpected purge success with an unlisted child table' >&2
  exit 1
fi
psql -d festival_purge_test -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
    IF (SELECT count(*) FROM public.orders) <> 1
       OR (SELECT count(*) FROM public.purge_extra_child) <> 1
       OR (SELECT value FROM public.counters WHERE key = 'pickup_number') IS DISTINCT FROM 43::bigint THEN
        RAISE EXCEPTION 'failed purge was not rolled back';
    END IF;
END $$;
SQL
