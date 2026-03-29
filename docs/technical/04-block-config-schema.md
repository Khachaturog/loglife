# План: таблицы конфигов блоков

Документ описывает изменения схемы БД для версионирования конфигов блоков. Цель — корректно отображать старые записи при изменении формы дела (удаление блоков, изменение опций, шкал и т.д.).

---

## 1. Текущее состояние

- **blocks.config** (jsonb) — текущий конфиг блока, редактируется при сохранении дела
- **record_answers** — ответы без привязки к версии конфига
- При изменении формы старые ответы не всегда корректно интерпретируются

---

## 2. Решение

- **blocks.config** — остаётся источником текущего конфига (редактируемое состояние)
- **Новые таблицы** — хранят версии конфигов, созданные только при сохранении записи
- **record_answers.config_version_id** — ссылка на версию конфига на момент ответа

---

## 3. Схема новых таблиц

### 3.1 Родительская таблица

```
block_config_versions (
  id         uuid PK default gen_random_uuid(),
  block_id   uuid NOT NULL FK → blocks(id) ON DELETE CASCADE,
  block_type text NOT NULL CHECK (block_type IN ('scale', 'single_select', 'multi_select')),
  created_at timestamptz NOT NULL default now()
)
```

Одна строка = одна версия конфига. Детали — в дочерних таблицах.

---

### 3.2 Шкала (scale)

```
block_config_scale_versions (
  id          uuid PK FK → block_config_versions(id) ON DELETE CASCADE,
  block_id    uuid NOT NULL,
  divisions   int NOT NULL CHECK (divisions BETWEEN 1 AND 10),
  label_left  text DEFAULT '',
  label_right text DEFAULT '',
  label_1     text,
  label_2     text,
  label_3     text,
  label_4     text,
  label_5     text,
  label_6     text,
  label_7     text,
  label_8     text,
  label_9     text,
  label_10    text,
  created_at  timestamptz NOT NULL default now()
)
```

- **label_1 … label_10** — подписи делений (на будущее), nullable
- **divisions** — сколько делений используется

---

### 3.3 Выбор (single_select, multi_select)

**Одна таблица, несколько строк на версию.**

```
block_config_select_option_versions (
  id uuid PK default gen_random_uuid(),
  config_version_id uuid NOT NULL FK → block_config_versions(id) ON DELETE CASCADE,
  block_id          uuid NOT NULL,
  option_id         uuid NOT NULL,
  label             text NOT NULL,
  sort_order        int NOT NULL,
  created_at        timestamptz NOT NULL default now()
)
```

- Одна версия конфига = несколько строк с одним `config_version_id`
- **option_id** — тот же id, что в `value_json.optionId` / `value_json.optionIds`
- Удалённая опция — просто отсутствует в новой версии

**Пример:**

| config_version_id | block_id | option_id | label   | sort_order |
|-------------------|----------|-----------|---------|------------|
| v1                | block-123| opt-A     | Читал   | 0          |
| v1                | block-123| opt-B     | Спал    | 1          |
| v1                | block-123| opt-C     | Гулял   | 2          |
| v2                | block-123| opt-A     | Читал   | 0          |
| v2                | block-123| opt-B     | Спал    | 1          |
| v2                | block-123| opt-C     | Гулял   | 2          |
| v2                | block-123| opt-D     | Работал | 3          |

---

### 3.4 record_answers — новая колонка

```
config_version_id uuid REFERENCES block_config_versions(id) ON DELETE SET NULL
```

- nullable: старые записи и блоки без конфига (number, text и т.п.) не имеют версии
- При просмотре старой записи: берём конфиг из версии по `config_version_id`; если он отличается от текущего `blocks.config` → ответ устарел

---

## 4. Логика

### 4.1 Где хранится актуальный конфиг

| Место | Роль |
|-------|------|
| **blocks.config** | Текущий редактируемый конфиг |
| **block_config_*_versions** | Зафиксированные версии, привязанные к ответам |

При редактировании дела обновляется `blocks.config`. Версии создаются только при сохранении записи.

---

### 4.2 Создание версии

**Момент:** при сохранении записи (FillForm → api.records.create/update).

1. Для каждого ответа (scale/select): взять текущий `blocks.config` (опции из `config.options`)
2. Найти или создать версию с таким конфигом
3. Записать `config_version_id` в `record_answers`

---

### 4.3 Устаревшие ответы

При просмотре записи:
- Если `config_version_id` есть и конфиг версии ≠ текущий `blocks.config` → устарел
- Если блок удалён (deleted_at) → устарел
- Устаревшие показывать в блоке «Устаревшее» с названием, ответом и конфигом

---

## 5. Блоки без конфига

| block_type | Конфиг | Таблица |
|------------|--------|---------|
| scale | divisions, label_left, label_right, label_1…10 | block_config_scale_versions |
| single_select, multi_select | options | block_config_select_option_versions |
| number, text_paragraph, yes_no, duration | нет | — |

Для блоков без конфига `config_version_id` = NULL.

---

## 6. Индексы и RLS

- Индексы: `block_id`, `config_version_id` по дочерним таблицам
- RLS: доступ через `blocks → deeds → user_id`

---

## 7. Порядок реализации

1. ~~Миграция: таблицы, индексы, RLS~~ ✅ `supabase/migrations/20250221000000_block_config_tables.sql`
2. ~~Типы в `src/types/database.ts`~~ ✅
3. ~~API: `findOrCreateConfigVersion`, обновление `records.create` и `records.update`~~ ✅
4. ~~RecordViewPage: логика «устаревшее», загрузка конфига по версии~~ ✅
5. Миграция данных: опционально — заполнение `config_version_id` для старых записей

---

## 8. Решения

- **Одна таблица с несколькими строками** для select — нормализация, проще запросы и изменения
- **Отдельные колонки label_1…10** для scale — на будущее, подписи делений
- **Критерий устаревания** — изменение важных полей конфига (divisions, label_left/right, options, порядок)
- **blocks.config** — остаётся источником текущего конфига (редактируемое состояние)
