-- T-53 적용 후: 설정은 ADR-0004의 6개만, 기존 주문·환불 수단은 그대로 남아야 한다.
DO $$
BEGIN
    IF (SELECT array_agg(key ORDER BY key) FROM public.app_settings) IS DISTINCT FROM ARRAY[
        'auto_complete.enabled', 'auto_complete.minutes', 'payment.expire_minutes',
        'transfer.account_holder', 'transfer.account_number', 'transfer.bank_name'
    ] THEN
        RAISE EXCEPTION 'Settings keys after T-53 are not the 6 ADR-0004 keys';
    END IF;
    IF (SELECT value FROM public.app_settings WHERE key = 'transfer.bank_name') <> '테스트은행' THEN
        RAISE EXCEPTION 'Existing transfer setting value was changed';
    END IF;
    IF (SELECT array_agg(payment_method::text || ':' || coalesce(refund_channel::text, '-') ORDER BY pickup_number)
        FROM public.orders) IS DISTINCT FROM ARRAY['cash:-', 'transfer:bank', 'cash:cash'] THEN
        RAISE EXCEPTION 'Existing orders were not preserved by T-53';
    END IF;
END $$;
