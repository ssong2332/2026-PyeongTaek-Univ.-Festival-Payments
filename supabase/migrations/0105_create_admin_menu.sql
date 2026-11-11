-- T-37 메뉴 신규 등록(F-46 계열): 메뉴·번역·옵션 구조를 한 트랜잭션으로 생성한다.
-- PostgREST/Supabase client에서 여러 INSERT를 이어 붙이지 않고 RPC 한 번으로 처리해
-- 중간 실패 시 부분 생성 데이터가 남지 않게 한다.
BEGIN;

CREATE FUNCTION public.create_admin_menu(
    p_base_price integer,
    p_stock integer,
    p_sort_order integer,
    p_translations jsonb,
    p_option_groups jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
    v_menu_id uuid;
    v_group_id uuid;
    v_option_id uuid;
    v_translation jsonb;
    v_group jsonb;
    v_option jsonb;
    v_option_count integer;
BEGIN
    IF p_base_price IS NULL OR p_base_price < 0 OR p_stock IS NULL OR p_stock < 0 THEN
        RAISE EXCEPTION 'INVALID_MENU';
    END IF;
    IF p_translations IS NULL OR jsonb_typeof(p_translations) <> 'array' THEN
        RAISE EXCEPTION 'INVALID_TRANSLATIONS';
    END IF;
    IF p_option_groups IS NULL OR jsonb_typeof(p_option_groups) <> 'array' THEN
        RAISE EXCEPTION 'INVALID_OPTION_GROUPS';
    END IF;

    INSERT INTO public.menu_items
        (base_price, stock, is_sold_out_manual, is_active, sort_order)
    VALUES
        (p_base_price, p_stock, false, true, coalesce(p_sort_order, 0))
    RETURNING id INTO v_menu_id;

    FOR v_translation IN SELECT value FROM jsonb_array_elements(p_translations) LOOP
        INSERT INTO public.menu_item_translations(menu_item_id, locale, name, description)
        VALUES (
            v_menu_id,
            v_translation->>'locale',
            v_translation->>'name',
            nullif(v_translation->>'description', '')
        );
    END LOOP;

    FOR v_group IN SELECT value FROM jsonb_array_elements(p_option_groups) LOOP
        IF jsonb_typeof(coalesce(v_group->'options', '[]'::jsonb)) <> 'array' THEN
            RAISE EXCEPTION 'INVALID_OPTION_GROUP';
        END IF;
        v_option_count := jsonb_array_length(coalesce(v_group->'options', '[]'::jsonb));
        IF (v_group->>'minSelect')::integer < 0
           OR (v_group->>'maxSelect')::integer < 1
           OR (v_group->>'maxSelect')::integer < (v_group->>'minSelect')::integer
           OR (v_group->>'minSelect')::integer > v_option_count
           OR (v_group->>'maxSelect')::integer > v_option_count THEN
            RAISE EXCEPTION 'INVALID_OPTION_GROUP';
        END IF;

        INSERT INTO public.option_groups(menu_item_id, min_select, max_select, sort_order, is_active)
        VALUES (
            v_menu_id,
            (v_group->>'minSelect')::integer,
            (v_group->>'maxSelect')::integer,
            coalesce((v_group->>'sortOrder')::integer, 0),
            true
        )
        RETURNING id INTO v_group_id;

        FOR v_translation IN SELECT value FROM jsonb_array_elements(coalesce(v_group->'translations', '[]'::jsonb)) LOOP
            INSERT INTO public.option_group_translations(option_group_id, locale, name)
            VALUES (v_group_id, v_translation->>'locale', v_translation->>'name');
        END LOOP;

        FOR v_option IN SELECT value FROM jsonb_array_elements(coalesce(v_group->'options', '[]'::jsonb)) LOOP
            INSERT INTO public.options(option_group_id, extra_price, sort_order, is_active)
            VALUES (
                v_group_id,
                (v_option->>'extraPrice')::integer,
                coalesce((v_option->>'sortOrder')::integer, 0),
                true
            )
            RETURNING id INTO v_option_id;

            FOR v_translation IN SELECT value FROM jsonb_array_elements(coalesce(v_option->'translations', '[]'::jsonb)) LOOP
                INSERT INTO public.option_translations(option_id, locale, name)
                VALUES (v_option_id, v_translation->>'locale', v_translation->>'name');
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN v_menu_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_admin_menu(integer, integer, integer, jsonb, jsonb)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin_menu(integer, integer, integer, jsonb, jsonb)
    TO service_role;

COMMIT;
