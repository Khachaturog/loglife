-- Флаг: подставлять default_value при новой записи (сам JSON при выкл. остаётся в колонке).
ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS default_value_enabled boolean NOT NULL DEFAULT false;

-- Уже сохранённые дефолты продолжаем подставлять.
UPDATE public.blocks
SET default_value_enabled = true
WHERE default_value IS NOT NULL;

COMMENT ON COLUMN public.blocks.default_value_enabled IS 'Если true — подставлять default_value на форме новой записи; false — только хранить черновик.';
