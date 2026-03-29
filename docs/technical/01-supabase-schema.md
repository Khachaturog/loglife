# Схема Supabase (Postgres)

Приложение использует Supabase: Postgres, Auth, клиент с фронтенда. Данные изолированы по пользователю через RLS.

**Пошаговая настройка проекта Supabase** — см. [02-supabase-setup.md](02-supabase-setup.md).

**План версионирования конфигов блоков** — см. [04-block-config-schema.md](04-block-config-schema.md).

## Таблицы

### deeds

| Колонка     | Тип         | Описание        |
|------------|-------------|-----------------|
| id         | uuid PK     | default gen_random_uuid() |
| user_id    | uuid FK → auth.users | Владелец |
| emoji      | text        | Эмодзи/символ   |
| name       | text        | Название        |
| description| text        | Описание        |
| category   | text        | Категория (опционально) |
| created_at | timestamptz | default now()  |
| updated_at | timestamptz | default now()  |

### blocks

| Колонка    | Тип         | Описание        |
|------------|-------------|-----------------|
| id         | uuid PK     |                 |
| deed_id    | uuid FK → deeds |              |
| sort_order | int4        | Порядок в форме |
| title      | text        | Текст вопроса   |
| block_type | text        | number, text_paragraph, single_select, multi_select, scale, yes_no, duration |
| is_required| boolean     | default false   |
| config     | jsonb       | Для scale: { divisions, labelLeft, labelRight } |
| deleted_at | timestamptz | null = активен  |
| created_at | timestamptz |                 |
| updated_at | timestamptz |                 |

### records

| Колонка     | Тип         | Описание        |
|------------|-------------|-----------------|
| id         | uuid PK     |                 |
| deed_id    | uuid FK → deeds |              |
| record_date| date        |                 |
| record_time| time        |                 |
| created_at | timestamptz |                 |
| updated_at | timestamptz |                 |

### record_answers

| Колонка           | Тип         | Описание        |
|------------------|-------------|-----------------|
| id                | uuid PK     |                 |
| record_id         | uuid FK → records |          |
| block_id          | uuid FK → blocks |           |
| value_json        | jsonb       | По типам блоков |
| config_version_id | uuid        | Версия конфига на момент ответа |
| created_at        | timestamptz |                 |
| updated_at        | timestamptz |                 |

## RLS

- deeds: пользователь видит/редактирует только строки с user_id = auth.uid().
- blocks: доступ через deed (проверка deed.user_id).
- records, record_answers: доступ через deed.

Создайте политики в Supabase Dashboard (Table Editor → каждой таблице → RLS policies) или выполните SQL из `supabase/migrations/` после настройки Supabase CLI.

## Переменные окружения (фронт)

- `VITE_SUPABASE_URL` — URL проекта Supabase.
- `VITE_SUPABASE_ANON_KEY` — anon (public) key.
