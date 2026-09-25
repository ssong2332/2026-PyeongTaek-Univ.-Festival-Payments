BEGIN;

-- Supabase Realtime에서 orders 테이블의 변경(INSERT, UPDATE) 브로드캐스팅 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- Realtime UPDATE 시 모든 컬럼 페이로드를 전달받을 수 있도록 REPLICA IDENTITY FULL 설정
ALTER TABLE public.orders REPLICA IDENTITY FULL;

COMMIT;
