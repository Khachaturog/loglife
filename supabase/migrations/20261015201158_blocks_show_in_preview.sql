-- Какие ответы блока попадают в превью записи в истории. По умолчанию все.
ALTER TABLE public.blocks
  ADD COLUMN IF NOT EXISTS show_in_preview boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.blocks.show_in_preview IS
  'Показывать ответ блока в превью записи (страница дела и вкладка «История»).';
