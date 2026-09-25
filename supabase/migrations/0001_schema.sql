BEGIN;

CREATE TYPE public.order_status AS ENUM (
    'pending', 'paid', 'cooking', 'completed', 'cancelled', 'refunded', 'expired'
);
CREATE TYPE public.payment_method AS ENUM ('cash', 'transfer');
CREATE TYPE public.transfer_method AS ENUM ('bank', 'kakaopay', 'toss');
CREATE TYPE public.refund_channel AS ENUM ('cash', 'bank', 'kakaopay', 'toss');
CREATE TYPE public.actor_type AS ENUM ('admin', 'system', 'customer');

CREATE TABLE public.menu_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    base_price integer NOT NULL CHECK (base_price >= 0),
    stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_sold_out_manual boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    image_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.menu_item_translations (
    menu_item_id uuid NOT NULL REFERENCES public.menu_items (id) ON DELETE CASCADE,
    locale text NOT NULL,
    name text NOT NULL CHECK (length(name) > 0),
    description text,
    PRIMARY KEY (menu_item_id, locale)
);

CREATE TABLE public.option_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id uuid NOT NULL REFERENCES public.menu_items (id) ON DELETE CASCADE,
    min_select integer NOT NULL DEFAULT 0 CHECK (min_select >= 0),
    max_select integer NOT NULL DEFAULT 1 CHECK (max_select >= min_select),
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.option_group_translations (
    option_group_id uuid NOT NULL REFERENCES public.option_groups (id) ON DELETE CASCADE,
    locale text NOT NULL,
    name text NOT NULL,
    PRIMARY KEY (option_group_id, locale)
);

CREATE TABLE public.options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    option_group_id uuid NOT NULL REFERENCES public.option_groups (id) ON DELETE CASCADE,
    extra_price integer NOT NULL DEFAULT 0 CHECK (extra_price >= 0),
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE public.option_translations (
    option_id uuid NOT NULL REFERENCES public.options (id) ON DELETE CASCADE,
    locale text NOT NULL,
    name text NOT NULL,
    PRIMARY KEY (option_id, locale)
);

CREATE TABLE public.counters (
    key text PRIMARY KEY,
    value bigint NOT NULL DEFAULT 0
);

CREATE TABLE public.orders (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pickup_number integer NOT NULL UNIQUE,
    status public.order_status NOT NULL DEFAULT 'pending',
    payment_method public.payment_method NOT NULL,
    transfer_method public.transfer_method,
    total_amount integer NOT NULL CHECK (total_amount >= 0),
    idempotency_key uuid NOT NULL UNIQUE,
    status_token text NOT NULL UNIQUE,
    locale text NOT NULL DEFAULT 'ko',
    transfer_reported_at timestamptz,
    cancel_requested_at timestamptz,
    cancel_rejected_at timestamptz,
    acknowledged_at timestamptz,
    acknowledged_by uuid,
    paid_at timestamptz,
    cooking_started_at timestamptz,
    completed_at timestamptz,
    closed_at timestamptz,
    refund_channel public.refund_channel,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT orders_transfer_method_matches_payment CHECK (
        (payment_method = 'transfer') = (transfer_method IS NOT NULL)
    )
);

CREATE TABLE public.order_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
    menu_item_id uuid NOT NULL REFERENCES public.menu_items (id) ON DELETE RESTRICT,
    menu_name_ko text NOT NULL,
    menu_name_en text,
    unit_price integer NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    options_price integer NOT NULL DEFAULT 0,
    line_total integer NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    CONSTRAINT order_items_line_total_matches CHECK (
        line_total::bigint = (unit_price::bigint + options_price::bigint) * quantity::bigint
    )
);

CREATE TABLE public.order_item_options (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id uuid NOT NULL REFERENCES public.order_items (id) ON DELETE CASCADE,
    option_id uuid NOT NULL REFERENCES public.options (id) ON DELETE RESTRICT,
    option_group_name_ko text NOT NULL,
    option_name_ko text NOT NULL,
    option_name_en text,
    extra_price integer NOT NULL
);

CREATE TABLE public.order_status_history (
    id bigserial PRIMARY KEY,
    order_id uuid NOT NULL REFERENCES public.orders (id) ON DELETE CASCADE,
    from_status public.order_status,
    to_status public.order_status NOT NULL,
    action text NOT NULL,
    actor_type public.actor_type NOT NULL,
    actor_id uuid,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.app_settings (
    key text PRIMARY KEY,
    value text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
);

CREATE INDEX orders_status_created_at_idx ON public.orders (status, created_at);
CREATE INDEX orders_created_at_idx ON public.orders (created_at);
-- pickup_number is already indexed by its UNIQUE constraint.
CREATE INDEX order_status_history_order_created_at_idx
    ON public.order_status_history (order_id, created_at);

CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

CREATE TRIGGER menu_items_set_updated_at
BEFORE UPDATE ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_group_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.option_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- RLS does not restrict TRUNCATE or sequence operations. Remove inherited defaults
-- now, so the schema is closed to browser roles even before 0003 is applied.
REVOKE ALL ON TABLE
    public.menu_items, public.menu_item_translations, public.option_groups,
    public.option_group_translations, public.options, public.option_translations,
    public.counters, public.orders, public.order_items, public.order_item_options,
    public.order_status_history, public.app_settings
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.order_status_history_id_seq FROM PUBLIC, anon, authenticated;

COMMIT;
