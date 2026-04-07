-- Явный режим отображения «Один из списка» при вводе: select (выпадающий список) или checkbox (как у multi_select).
-- Старые строки без ключа получают select — прежнее поведение приложения.
UPDATE public.blocks
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{singleSelectUi}',
  to_jsonb('select'::text),
  true
)
WHERE block_type = 'single_select'
  AND (config IS NULL OR NOT (config ? 'singleSelectUi'));
