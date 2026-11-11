#!/usr/bin/env bash
# Runs only against the local Supabase test server and a disposable DB.
set -euo pipefail

if [[ "${PGHOST:-}" != "127.0.0.1" || "${PGPORT:-}" != "54322" ||
      "${PGUSER:-}" != "postgres" || "${SUPABASE_URL:-}" != "http://127.0.0.1:54321" ]]; then
  echo 'T-30 purge test requires the local Supabase test server' >&2
  exit 1
fi

psql -d postgres -v ON_ERROR_STOP=1 -c 'CREATE DATABASE festival_purge_test'
trap 'psql -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE festival_purge_test WITH (FORCE)" >/dev/null' EXIT

# Supabase creates these before migrations; a plain CREATE DATABASE does not copy them.
psql -d festival_purge_test -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE PUBLICATION supabase_realtime;
SQL

mapfile -t migrations < <(find supabase/migrations -maxdepth 1 -type f \
  -name '[0-9][0-9][0-9][0-9]_*.sql' | LC_ALL=C sort)
if [[ ${#migrations[@]} -eq 0 || ! -f supabase/migrations/0104_manual_orders.sql ||
      ! -f supabase/migrations/0105_create_admin_menu.sql ]]; then
  echo 'Expected the complete dev migration set through 0105' >&2
  exit 1
fi
for migration in "${migrations[@]}"; do
  echo "Applying ${migration}"
  psql -d festival_purge_test -v ON_ERROR_STOP=1 -f "${migration}" >/dev/null
done
psql -d festival_purge_test -v ON_ERROR_STOP=1 -f tests/integration/purge_2026-11-08.sql >/dev/null

# The date gate has passed; exercise the exact checked-in SQL without replacing it.
psql -d festival_purge_test -v ON_ERROR_STOP=1 -f supabase/scripts/purge_2026-11-08.sql >/dev/null
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
       OR (SELECT stock FROM public.menu_items WHERE id = '11111111-1111-1111-1111-111111111111') IS DISTINCT FROM 38
       OR (SELECT value FROM public.app_settings WHERE key = 'purge.test') IS DISTINCT FROM 'keep'
       OR (SELECT count(*) FROM public.options) <> 1
       OR (SELECT count(*) FROM public.shifts WHERE person_name = '테스트 근무자') <> 1 THEN
        RAISE EXCEPTION 'purge result or preserved data mismatch';
    END IF;
END $$;
SQL

# Re-running on empty order tables must be safe.
psql -d festival_purge_test -v ON_ERROR_STOP=1 -f supabase/scripts/purge_2026-11-08.sql >/dev/null

# A new, unlisted child table must stop the purge and roll the whole transaction back.
psql -d festival_purge_test -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public.orders (id, pickup_number, payment_method, total_amount, idempotency_key, status_token)
VALUES ('77777777-7777-7777-7777-777777777777', 43, 'cash', 0,
        '88888888-8888-8888-8888-888888888888', 'purge-blocked-token');
UPDATE public.counters SET value = 43 WHERE key = 'pickup_number';
CREATE TABLE public.purge_extra_child (order_id uuid REFERENCES public.orders(id));
INSERT INTO public.purge_extra_child VALUES ('77777777-7777-7777-7777-777777777777');
SQL
if psql -d festival_purge_test -v ON_ERROR_STOP=1 -f supabase/scripts/purge_2026-11-08.sql >/dev/null 2>&1; then
  echo 'Unexpected purge success with an unlisted child table' >&2
  exit 1
fi
psql -d festival_purge_test -v ON_ERROR_STOP=1 <<'SQL'
DO $$ BEGIN
    IF (SELECT count(*) FROM public.orders) <> 1
       OR (SELECT count(*) FROM public.purge_extra_child) <> 1
       OR (SELECT value FROM public.counters WHERE key = 'pickup_number') IS DISTINCT FROM 43::bigint
       OR (SELECT count(*) FROM public.shifts WHERE person_name = '테스트 근무자') <> 1 THEN
        RAISE EXCEPTION 'failed purge was not rolled back';
    END IF;
END $$;
SQL
