BEGIN;

ALTER TABLE public.menu_items
    ADD COLUMN is_recommended boolean NOT NULL DEFAULT false;

COMMIT;
