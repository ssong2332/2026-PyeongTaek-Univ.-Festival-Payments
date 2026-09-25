-- T-53 적용 직전의 기존 DB 상태: 과거 시드(설정 8개)와 T-53 이전 스키마로 만든 주문.
INSERT INTO public.app_settings (key, value)
VALUES
    ('payment.expire_minutes', '10'),
    ('auto_complete.enabled', 'false'),
    ('auto_complete.minutes', '15'),
    ('transfer.bank_name', '테스트은행'),
    ('transfer.account_number', '000-000'),
    ('transfer.account_holder', '테스트'),
    ('transfer.kakaopay_url_template', 'https://example.invalid/{amount}'),
    ('transfer.toss_url_template', 'https://example.invalid/{amount}');

INSERT INTO public.orders
    (id, pickup_number, status, payment_method, transfer_method, total_amount,
     idempotency_key, status_token, refund_channel)
VALUES
    ('53000000-0000-4000-8000-0000000000b1', 1, 'pending', 'cash', NULL, 2000,
     '53000000-0000-4000-8000-0000000000c1', repeat('p', 64), NULL),
    ('53000000-0000-4000-8000-0000000000b2', 2, 'refunded', 'transfer', 'bank', 3000,
     '53000000-0000-4000-8000-0000000000c2', repeat('q', 64), 'bank'),
    ('53000000-0000-4000-8000-0000000000b3', 3, 'refunded', 'cash', NULL, 2500,
     '53000000-0000-4000-8000-0000000000c3', repeat('r', 64), 'cash');
