BEGIN;

REVOKE ALL ON TABLE
    public.menu_items, public.menu_item_translations, public.option_groups,
    public.option_group_translations, public.options, public.option_translations,
    public.counters, public.orders, public.order_items, public.order_item_options,
    public.order_status_history, public.app_settings
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.order_status_history_id_seq FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT ON TABLE
    public.menu_items, public.menu_item_translations, public.option_groups,
    public.option_group_translations, public.options, public.option_translations,
    public.orders, public.order_items, public.order_item_options,
    public.order_status_history, public.app_settings
TO authenticated;

GRANT ALL ON TABLE
    public.menu_items, public.menu_item_translations, public.option_groups,
    public.option_group_translations, public.options, public.option_translations,
    public.counters, public.orders, public.order_items, public.order_item_options,
    public.order_status_history, public.app_settings
TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.order_status_history_id_seq TO service_role;

-- Architecture 3 assumes public sign-up is disabled and every authenticated
-- account is an administrator. All writes still go through server Route Handlers.
CREATE POLICY authenticated_select ON public.menu_items
    FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select ON public.menu_item_translations
    FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select ON public.option_groups
    FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select ON public.option_group_translations
    FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select ON public.options
    FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select ON public.option_translations
    FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select ON public.orders
    FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select ON public.order_items
    FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select ON public.order_item_options
    FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select ON public.order_status_history
    FOR SELECT TO authenticated USING (true);
CREATE POLICY authenticated_select ON public.app_settings
    FOR SELECT TO authenticated USING (true);

-- counters has no client policy. service_role uses Supabase's existing BYPASSRLS.
-- 0002 belongs to the RPC tasks and can be absent during T-03-only validation.
DO $$
DECLARE
    rpc_signature regprocedure;
BEGIN
    FOR rpc_signature IN
        SELECT p.oid::regprocedure
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
            AND p.proname IN (
                'create_order', 'transition_order', 'sweep_order_timeouts',
                'count_waiting_before', 'consume_rate_limit'
            )
            AND p.prokind = 'f'
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', rpc_signature);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', rpc_signature);
    END LOOP;
END $$;

-- Future RPC migrations (including 0006) must revoke PUBLIC/anon/authenticated
-- and grant service_role on their own signatures when each function is created.

COMMIT;
