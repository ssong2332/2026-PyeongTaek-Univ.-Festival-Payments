-- 교대 시 재고 사진 기록. 파일은 비공개 Supabase Storage 버킷에 두고,
-- 이 테이블에는 경로와 촬영 메타데이터만 보관한다.
BEGIN;

CREATE TABLE public.inventory_photos (
    id uuid PRIMARY KEY,
    storage_path text NOT NULL UNIQUE,
    captured_by text NOT NULL CHECK (char_length(btrim(captured_by)) BETWEEN 1 AND 80),
    captured_at timestamptz NOT NULL DEFAULT now(),
    uploaded_by uuid NOT NULL,
    content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
    byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 5242880)
);

CREATE INDEX inventory_photos_captured_at_idx
    ON public.inventory_photos (captured_at DESC, id DESC);

-- 업로드 전에 생성한다. 메타데이터 저장과 보상 삭제가 모두 실패해도
-- 관리자 정리 작업에서 Storage 파일을 다시 찾을 수 있어야 한다.
CREATE TABLE public.inventory_photo_uploads (
    id uuid PRIMARY KEY,
    storage_path text NOT NULL UNIQUE,
    uploaded_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inventory_photo_uploads_created_at_idx
    ON public.inventory_photo_uploads (created_at, id);

ALTER TABLE public.inventory_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_photo_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.inventory_photos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.inventory_photo_uploads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.inventory_photos TO service_role;
GRANT ALL ON public.inventory_photo_uploads TO service_role;

COMMIT;
