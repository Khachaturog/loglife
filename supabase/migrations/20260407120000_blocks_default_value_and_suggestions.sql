-- Значение по умолчанию для поля при создании записи (формат как record_answers.value_json).
ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS default_value jsonb;

-- Чипы «недавние значения» на форме записи (для number / single_select).
ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS recent_suggestions_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.blocks.default_value IS 'Подстановка при открытии формы новой записи; тот же JSON, что value_json у ответа.';
COMMENT ON COLUMN public.blocks.recent_suggestions_enabled IS 'Показывать чипы недавних значений (типы number, single_select).';
