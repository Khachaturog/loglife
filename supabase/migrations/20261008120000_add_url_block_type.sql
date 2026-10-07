-- Тип блока «Ссылка URL»: адрес открывается при просмотре записи.
ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_block_type_check;
ALTER TABLE public.blocks ADD CONSTRAINT blocks_block_type_check
  CHECK (block_type IN ('number','text_paragraph','single_select','multi_select','scale','yes_no','duration','url'));
