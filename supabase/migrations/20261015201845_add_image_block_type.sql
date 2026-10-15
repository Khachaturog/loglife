-- Тип блока «Картинка»: в ответе только путь, файл — в приватном бакете.
ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_block_type_check;
ALTER TABLE public.blocks ADD CONSTRAINT blocks_block_type_check
  CHECK (block_type IN ('number','text_paragraph','single_select','multi_select','scale','yes_no','duration','url','image'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('record-images', 'record-images', false, 24576, ARRAY['image/webp']::text[])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 24576,
    allowed_mime_types = ARRAY['image/webp']::text[];

-- Путь: {user_id}/{record_id}/{block_id}.webp. Первая папка — владелец.
-- Upsert требует SELECT + INSERT + UPDATE, удаление — DELETE.
DROP POLICY IF EXISTS "record_images_select_own" ON storage.objects;
CREATE POLICY "record_images_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'record-images'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "record_images_insert_own" ON storage.objects;
CREATE POLICY "record_images_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'record-images'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "record_images_update_own" ON storage.objects;
CREATE POLICY "record_images_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'record-images'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'record-images'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "record_images_delete_own" ON storage.objects;
CREATE POLICY "record_images_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'record-images'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Удаление аккаунта забирает и файлы картинок, иначе они остаются в бакете.
CREATE OR REPLACE FUNCTION public.delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Нужна авторизация';
  END IF;

  DELETE FROM public.record_answers
  WHERE record_id IN (
    SELECT r.id
    FROM public.records r
    JOIN public.deeds d ON d.id = r.deed_id
    WHERE d.user_id = v_uid
  );

  DELETE FROM public.block_config_select_option_versions
  WHERE block_id IN (
    SELECT b.id
    FROM public.blocks b
    JOIN public.deeds d ON d.id = b.deed_id
    WHERE d.user_id = v_uid
  );

  DELETE FROM public.block_config_scale_versions
  WHERE block_id IN (
    SELECT b.id
    FROM public.blocks b
    JOIN public.deeds d ON d.id = b.deed_id
    WHERE d.user_id = v_uid
  );

  DELETE FROM public.block_config_versions
  WHERE block_id IN (
    SELECT b.id
    FROM public.blocks b
    JOIN public.deeds d ON d.id = b.deed_id
    WHERE d.user_id = v_uid
  );

  DELETE FROM public.records
  WHERE deed_id IN (SELECT id FROM public.deeds WHERE user_id = v_uid);

  DELETE FROM public.blocks
  WHERE deed_id IN (SELECT id FROM public.deeds WHERE user_id = v_uid);

  DELETE FROM public.deeds
  WHERE user_id = v_uid;

  DELETE FROM public.pomodoro_sessions WHERE user_id = v_uid;
  DELETE FROM public.pomodoro_projects WHERE user_id = v_uid;
  DELETE FROM public.pomodoro_settings WHERE user_id = v_uid;

  DELETE FROM storage.objects
  WHERE bucket_id = 'record-images'
    AND (storage.foldername(name))[1] = v_uid::text;

  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
