-- Forward-only T-03 review fixes; 0002 through 0006 are reserved by Architecture.
-- Requires 0001_schema.sql, including public.set_updated_at().
BEGIN;

ALTER TABLE public.order_items
    ADD CONSTRAINT order_items_unit_price_nonnegative CHECK (unit_price >= 0),
    ADD CONSTRAINT order_items_options_price_nonnegative CHECK (options_price >= 0),
    ADD CONSTRAINT order_items_line_total_nonnegative CHECK (line_total >= 0);

ALTER TABLE public.order_item_options
    ADD CONSTRAINT order_item_options_extra_price_nonnegative CHECK (extra_price >= 0);

CREATE TRIGGER app_settings_set_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
