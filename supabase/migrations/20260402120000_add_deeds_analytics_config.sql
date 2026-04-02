-- Настройки отображения аналитики на карточке дела (JSON, см. docs/technical/01-supabase-schema.md)
ALTER TABLE public.deeds ADD COLUMN IF NOT EXISTS analytics_config jsonb;

COMMENT ON COLUMN public.deeds.analytics_config IS 'Конфиг отображения аналитики (сводка, активность, heatmap); версия схемы внутри JSON.';
