-- Какие действия записи дополнительно закреплены кнопками в шапке. В меню «⋯» список полный.
ALTER TABLE public.deeds
  ADD COLUMN IF NOT EXISTS record_header_pinned text[] NOT NULL DEFAULT ARRAY['edit']::text[];

ALTER TABLE public.deeds
  DROP CONSTRAINT IF EXISTS deeds_record_header_pinned_len;

ALTER TABLE public.deeds
  ADD CONSTRAINT deeds_record_header_pinned_len
  CHECK (cardinality(record_header_pinned) <= 2);

ALTER TABLE public.deeds
  DROP CONSTRAINT IF EXISTS deeds_record_header_pinned_ids;

ALTER TABLE public.deeds
  ADD CONSTRAINT deeds_record_header_pinned_ids
  CHECK (
    record_header_pinned <@ ARRAY['edit', 'new', 'duplicate', 'delete', 'help']::text[]
  );

COMMENT ON COLUMN public.deeds.record_header_pinned IS
  'До двух id действий в шапке записи, в порядке кнопок: edit, new, duplicate, delete, help. Пустой массив — только меню «⋯».';
