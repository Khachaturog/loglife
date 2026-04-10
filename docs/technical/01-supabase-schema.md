# Актуальная схема базы данных

> Документ отражает финальное состояние после всех миграций из `supabase/migrations/`.  
> При добавлении новой миграции — обновлять этот файл.

---

## ER-диаграмма

```
auth.users (Supabase Auth)
    │
    │ user_id
    ▼
┌─────────────────────────────────────────────────┐
│ deeds                                           │
│  id · user_id · emoji · name · description     │
│  category · card_color · analytics_config      │
│  quick_add_defaults_enabled                    │
│  created_at · updated_at                       │
└────────────────────┬────────────────────────────┘
                     │ deed_id
          ┌──────────┴──────────┐
          ▼                     ▼
┌─────────────────┐   ┌─────────────────────────────────┐
│ blocks          │   │ records                         │
│  id · deed_id   │   │  id · deed_id · record_date     │
│  sort_order     │   │  record_time · created_at       │
│  title          │   │  updated_at                     │
│  block_type     │   └──────────────┬──────────────────┘
│  is_required    │                  │ record_id
│  default_value  │                  ▼
│  default_enab.  │   ┌─────────────────────────────────┐
│  recent_suggest.│   │ record_answers                  │
│  config (jsonb) │   │  id · record_id · block_id      │
│  deleted_at     │   │  value_json · config_version_id │
└────┬────────────┘   │  created_at · updated_at        │
     │ block_id        └─────────────────────────────────┘
     ▼                 
┌──────────────────────┴──────────────────────────┐
│ block_config_versions                           │
│  id · block_id · block_type · created_at        │
└──────┬──────────────────┬───────────────────────┘
       │ id (1:1)         │ id
       ▼                  ▼
┌─────────────────┐  ┌────────────────────────────────────┐
│ block_config_   │  │ block_config_select_option_versions│
│ scale_versions  │  │  id · config_version_id · block_id │
│  id · block_id  │  │  option_id · label · sort_order    │
│  divisions      │  │  created_at                        │
│  label_1..10    │  └────────────────────────────────────┘
│  created_at     │
└─────────────────┘
```

---

## Таблицы

### `deeds` — Дела (форм-трекеры)

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|---------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `user_id` | uuid | NOT NULL, FK → auth.users(id) ON DELETE CASCADE | Владелец |
| `emoji` | text | NOT NULL, DEFAULT '📋' | |
| `name` | text | NOT NULL, DEFAULT '' | |
| `description` | text | | Markdown/plain |
| `category` | text | | Опциональная категория |
| `card_color` | text | | Цвет карточки (опционально) |
| `analytics_config` | jsonb | | Настройки отображения аналитики на карточке дела (см. ниже); `null` = дефолты в приложении |
| `quick_add_defaults_enabled` | boolean | NOT NULL, DEFAULT false | Вкл. у пользователя: короткое «+» создаёт запись из дефолтов блоков, если дефолты полные и валидны |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Структура `analytics_config` (версия 1):**

```jsonc
{
  "version": 1,
  "summary": {
    "enabled": true,
    "block_id": null,
    "show_today": true,
    "show_month": true,
    "show_total": true
  },
  "activity": {
    "enabled": true,
    "streak_enabled": true,
    "max_streak_enabled": true,
    "record_count_enabled": true,
    "workday_weekend_enabled": true
  },
  "heatmap": {
    "enabled": true,
    "block_id": null,
    "show_weekday_labels": true,
    "show_month_labels": true,
    "show_peak_and_legend": true
  }
}
```

- `summary.block_id` / `heatmap.block_id` — uuid блока с типом `number`, `scale` или `duration`; `null` — поведение «по умолчанию» (первый такой блок по `sort_order`; для heatmap без блока — число записей в день).
- `summary.show_*` — видимость карточек «Сегодня» / «За месяц» / «Всего»; при отсутствии в JSON подставляются `true`.
- `activity.enabled` — мастер-переключатель блока «активность по записям» на карточке дела; без него игнорируются флаги ниже.
- `activity.max_streak_enabled` — строка «Максимум» в карточке стрика; только при `streak_enabled`.
- `activity.workday_weekend_enabled` — как `max_streak_enabled` при выключенном стрике: значение может оставаться `true` в JSON при `record_count_enabled: false` (в UI скрыто); на карточке счётчик показывается только при включённом «Всего».
- `heatmap.show_weekday_labels` / `show_month_labels` / `show_peak_and_legend` — оформление теплокарты (подписи недели и месяцев, нижний ряд «пик» и легенда уровней).
- Цвет ячеек теплокарты — только колонка `deeds.card_color` (валидный `#RRGGBB`); в `analytics_config` цвет не хранится. Устаревшие ключи `heatmap.use_card_color` / `heatmap.accent_hex` в старых JSON игнорируются при нормализации.

---

### `blocks` — Блоки (поля формы дела)

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|---------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `deed_id` | uuid | NOT NULL, FK → deeds(id) ON DELETE CASCADE | |
| `sort_order` | int | NOT NULL, DEFAULT 0 | Порядок в форме |
| `title` | text | NOT NULL, DEFAULT '' | Текст вопроса |
| `block_type` | text | NOT NULL, CHECK (см. ниже) | Тип блока |
| `is_required` | boolean | NOT NULL, DEFAULT false | |
| `default_value` | jsonb | | Черновик значения; формат как `record_answers.value_json`; NULL = нет |
| `default_value_enabled` | boolean | NOT NULL, DEFAULT false | Подставлять `default_value` при открытии формы новой записи |
| `recent_suggestions_enabled` | boolean | NOT NULL, DEFAULT true | Чипы недавних значений на форме записи (типы `number`, `single_select`) |
| `config` | jsonb | | Конфиг блока (см. ниже) |
| `deleted_at` | timestamptz | | null = активен; soft delete |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Допустимые значения `block_type`:**

| Значение | Описание |
|----------|---------|
| `number` | Числовое значение |
| `text_paragraph` | Текстовый ответ |
| `single_select` | Один вариант из списка |
| `multi_select` | Несколько вариантов из списка |
| `scale` | Шкала (1–N делений) |
| `yes_no` | Да/Нет |
| `duration` | Продолжительность (HH:MM:SS) |

**Структура `config` jsonb по типам:**

```jsonc
// number
{ "unit": "кг" }  // опционально

// scale
{ "divisions": 5 }  // текущий конфиг; история — в block_config_scale_versions

// multi_select
{ "options": [{ "id": "uuid", "label": "Вариант", "sort_order": 0 }] }

// single_select — те же options плюс режим ввода (после миграции всегда задано для строк с этим типом)
{ "options": [...], "singleSelectUi": "select" }  // или "checkbox" — чекбоксы как у multi_select; просмотр записи — по-прежнему текст

// duration, yes_no, text_paragraph — config не используется
```

---

### `records` — Записи (заполненные формы)

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|---------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `deed_id` | uuid | NOT NULL, FK → deeds(id) ON DELETE CASCADE | |
| `record_date` | date | NOT NULL | |
| `record_time` | time | NOT NULL | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

---

### `record_answers` — Ответы на блоки

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|---------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `record_id` | uuid | NOT NULL, FK → records(id) ON DELETE CASCADE | |
| `block_id` | uuid | NOT NULL, FK → blocks(id) | |
| `value_json` | jsonb | NOT NULL | Значение (см. ниже) |
| `config_version_id` | uuid | FK → block_config_versions(id) ON DELETE SET NULL | Версия конфига на момент ответа |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now() | |

**Структура `value_json` по типам:**

```jsonc
// number
{ "value": 42 }

// text_paragraph
{ "text": "Заметка" }

// single_select
{ "option_id": "uuid" }

// multi_select
{ "option_ids": ["uuid1", "uuid2"] }

// scale
{ "value": 3 }

// yes_no
{ "value": true }

// duration
{ "seconds": 3720 }  // 1 ч 02 мин
```

---

### `block_config_versions` — Версии конфигов блоков

Родительская таблица; каждая строка — снимок конфига блока в момент сохранения формы.

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|---------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `block_id` | uuid | NOT NULL, FK → blocks(id) ON DELETE CASCADE | |
| `block_type` | text | NOT NULL, CHECK IN ('scale','single_select','multi_select') | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

---

### `block_config_scale_versions` — Версии конфига шкалы

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|---------|
| `id` | uuid | PK, FK → block_config_versions(id) ON DELETE CASCADE | Тот же id |
| `block_id` | uuid | NOT NULL, FK → blocks(id) | |
| `divisions` | int | NOT NULL, CHECK (1–10) | Кол-во делений |
| `label_1`..`label_10` | text | | Подписи делений |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

---

### `block_config_select_option_versions` — Версии вариантов select

| Колонка | Тип | Ограничения | Описание |
|---------|-----|-------------|---------|
| `id` | uuid | PK, DEFAULT gen_random_uuid() | |
| `config_version_id` | uuid | NOT NULL, FK → block_config_versions(id) ON DELETE CASCADE | |
| `block_id` | uuid | NOT NULL, FK → blocks(id) | |
| `option_id` | uuid | NOT NULL | Стабильный ID варианта (из blocks.config.options) |
| `label` | text | NOT NULL, DEFAULT '' | Текст варианта на момент ответа |
| `sort_order` | int | NOT NULL, DEFAULT 0 | |
| `created_at` | timestamptz | NOT NULL, DEFAULT now() | |

---

## Индексы

| Индекс | Таблица | Колонки |
|--------|---------|---------|
| `idx_blocks_deed_id` | blocks | deed_id |
| `idx_blocks_deleted_at` | blocks | deleted_at |
| `idx_records_deed_id` | records | deed_id |
| `idx_records_deed_date_time` | records | deed_id, record_date DESC, record_time DESC |
| `idx_record_answers_record_id` | record_answers | record_id |
| `idx_record_answers_block_id` | record_answers | block_id |
| `idx_block_config_versions_block_id` | block_config_versions | block_id |
| `idx_block_config_scale_versions_block_id` | block_config_scale_versions | block_id |
| `idx_block_config_select_option_versions_config_version_id` | block_config_select_option_versions | config_version_id |

---

## RLS (Row Level Security)

Все таблицы защищены RLS. Доступ — только к собственным данным через цепочку владения.

| Таблица | Политика доступа |
|---------|-----------------|
| `deeds` | `user_id = (select auth.uid())` |
| `blocks` | через `deeds.user_id` |
| `records` | через `deeds.user_id` |
| `record_answers` | через `records → deeds.user_id` |
| `block_config_versions` | через `blocks → deeds.user_id` |
| `block_config_scale_versions` | через `blocks → deeds.user_id` |
| `block_config_select_option_versions` | через `block_config_versions → blocks → deeds.user_id` |

> Используется `(select auth.uid())` вместо `auth.uid()` — вычисляется один раз на запрос (initplan), а не на каждую строку.

Все политики покрывают 4 операции: SELECT, INSERT, UPDATE, DELETE.

---

## История изменений схемы

| Миграция | Изменение |
|----------|-----------|
| `20250212` | Начальная схема: deeds, blocks, block_options, records, record_answers + RLS |
| `20250219` | Удалена колонка `records.notes` |
| `20250220` | Добавлена `deeds.category` |
| `20250220` | Добавлен тип блока `duration` |
| `20250221` | Добавлены таблицы block_config_versions, block_config_scale_versions, block_config_select_option_versions; добавлена `record_answers.config_version_id` |
| `20250225` | Бэкфилл label_1..N (данные) |
| `20250225` | Удалены `block_config_scale_versions.label_left` и `label_right` |
| `20250225` | Удалены `record_answers.snapshot_title`, `snapshot_deleted_at`, `is_outdated` |
| `20250226` | Удалена таблица `block_options` |
| `20250227` | Добавлены недостающие FK-ограничения |
| `20250227` | RLS: `auth.uid()` → `(select auth.uid())` во всех политиках |
| `20260329` | Тип `text_short` удалён, данные мигрированы в `text_paragraph` |
| `20260402` | Добавлена `deeds.analytics_config` (jsonb) |
| `20260409` | В `blocks.config` для `single_select` бэкфилл `singleSelectUi: "select"` |
