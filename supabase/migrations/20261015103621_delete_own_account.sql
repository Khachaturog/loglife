-- Удаление своего аккаунта. Клиент с anon-ключом не может трогать auth.users.
-- Функция без аргументов: удаляется только auth.uid().
-- record_answers.block_id и block_id версий конфига без ON DELETE CASCADE,
-- поэтому данные чистим явно, до удаления пользователя.

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

  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

-- По умолчанию EXECUTE есть у PUBLIC; в Supabase ещё и у anon / service_role.
REVOKE ALL ON FUNCTION public.delete_own_account() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_own_account() TO authenticated;
