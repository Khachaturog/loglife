-- Счётчик заполненности на карточке записи. Включается на вкладке «Превью».
ALTER TABLE public.deeds
  ADD COLUMN IF NOT EXISTS fill_counter_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.deeds
  ADD COLUMN IF NOT EXISTS fill_counter_show_complete boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.deeds.fill_counter_enabled IS
  'Показывать на карточке записи «заполнено/всего», если есть пустые поля.';

COMMENT ON COLUMN public.deeds.fill_counter_show_complete IS
  'Показывать счётчик и когда заполнены все поля. Учитывается только при fill_counter_enabled.';
