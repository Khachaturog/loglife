-- Удаление типа блока text_short: ответы { text } совпадают с text_paragraph — только меняем block_type.
UPDATE public.blocks SET block_type = 'text_paragraph' WHERE block_type = 'text_short';

ALTER TABLE public.blocks DROP CONSTRAINT IF EXISTS blocks_block_type_check;
ALTER TABLE public.blocks ADD CONSTRAINT blocks_block_type_check
  CHECK (block_type IN ('number','text_paragraph','single_select','multi_select','scale','yes_no','duration'));
