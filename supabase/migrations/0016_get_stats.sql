-- T-21 / DECISIONS #19. 0013~0015 are reserved in Architecture 2-1.
BEGIN;

CREATE FUNCTION public.get_stats(p_date text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    v_date text := COALESCE(p_date, to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD'));
    v_start timestamptz;
    v_end timestamptz;
    v_result jsonb;
BEGIN
    IF v_date <> 'all' THEN
        IF v_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
            RAISE EXCEPTION 'date must be YYYY-MM-DD or all' USING ERRCODE = '22023';
        END IF;
        BEGIN
            v_start := v_date::date::timestamp AT TIME ZONE 'Asia/Seoul';
        EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
            RAISE EXCEPTION 'date must be a valid calendar day' USING ERRCODE = '22023';
        END;
        v_end := (v_date::date + 1)::timestamp AT TIME ZONE 'Asia/Seoul';
    END IF;

    WITH selected_orders AS MATERIALIZED (
        SELECT id, status, total_amount, created_at
        FROM public.orders
        WHERE v_date = 'all' OR (created_at >= v_start AND created_at < v_end)
    ), summary AS (
        SELECT
            COALESCE(sum(total_amount) FILTER (WHERE status IN ('paid', 'cooking', 'completed')), 0) AS sales,
            count(*) FILTER (WHERE status IN ('paid', 'cooking', 'completed', 'refunded')) AS order_count,
            COALESCE(sum(total_amount) FILTER (WHERE status = 'refunded'), 0) AS refunded_amount,
            count(*) FILTER (WHERE status = 'refunded') AS refunded_count,
            count(*) FILTER (WHERE status = 'pending') AS pending_count,
            count(*) FILTER (WHERE status = 'paid') AS paid_count,
            count(*) FILTER (WHERE status = 'cooking') AS cooking_count,
            count(*) FILTER (WHERE status = 'completed') AS completed_count,
            count(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
            count(*) FILTER (WHERE status = 'expired') AS expired_count
        FROM selected_orders
    ), menu_quantities AS (
        SELECT oi.menu_item_id, min(oi.menu_name_ko) AS name_ko, sum(oi.quantity) AS quantity
        FROM selected_orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.status IN ('paid', 'cooking', 'completed')
        GROUP BY oi.menu_item_id
    ), menu_ratios AS (
        SELECT menu_item_id, name_ko, quantity,
            quantity::numeric / sum(quantity) OVER () AS ratio
        FROM menu_quantities
    ), menu_series AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'menuItemId', menu_item_id,
            'nameKo', name_ko,
            'quantity', quantity,
            'ratio', ratio
        ) ORDER BY quantity DESC, menu_item_id), '[]'::jsonb) AS value
        FROM menu_ratios
    )
    SELECT jsonb_build_object(
        'date', v_date,
        'sales', s.sales,
        'orderCount', s.order_count,
        'refundedAmount', s.refunded_amount,
        'refundedCount', s.refunded_count,
        'byMenu', m.value,
        'totals', jsonb_build_object(
            'pending', s.pending_count, 'paid', s.paid_count,
            'cooking', s.cooking_count, 'completed', s.completed_count,
            'cancelled', s.cancelled_count, 'refunded', s.refunded_count,
            'expired', s.expired_count
        )
    ) INTO v_result
    FROM summary s CROSS JOIN menu_series m;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_stats(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_stats(text) TO service_role;

COMMIT;
