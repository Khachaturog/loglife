-- Быстрое создание записи по дефолтам блоков (включается пользователем в редакторе дела).
ALTER TABLE public.deeds
  ADD COLUMN IF NOT EXISTS quick_add_defaults_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.deeds.quick_add_defaults_enabled IS
  'Если true и у всех активных блоков заданы валидные дефолты — короткое «+» создаёт запись без формы.';
