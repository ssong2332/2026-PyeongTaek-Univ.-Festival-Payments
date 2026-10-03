BEGIN;

CREATE TABLE public.reviews (
    order_id uuid PRIMARY KEY REFERENCES public.orders (id) ON DELETE CASCADE,
    rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text text CHECK (char_length(text) <= 200),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.reviews TO authenticated;
GRANT ALL ON TABLE public.reviews TO service_role;

CREATE POLICY authenticated_select ON public.reviews
    FOR SELECT TO authenticated USING (true);

CREATE FUNCTION public.check_review_completed_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    current_status public.order_status;
BEGIN
    SELECT status INTO current_status
    FROM public.orders
    WHERE id = NEW.order_id
    FOR SHARE;

    -- Missing orders are rejected by the foreign key.
    IF FOUND AND current_status <> 'completed'::public.order_status THEN
        RAISE EXCEPTION 'REVIEW_REQUIRES_COMPLETED_ORDER'
            USING ERRCODE = '23514', CONSTRAINT = 'reviews_completed_order';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_review_completed_order() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_review_completed_order() TO service_role;

CREATE TRIGGER reviews_completed_order
BEFORE INSERT OR UPDATE OF order_id ON public.reviews
FOR EACH ROW EXECUTE FUNCTION public.check_review_completed_order();

COMMIT;
