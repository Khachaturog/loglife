# Contributing to Log Life

Log Life — open source приложение для личного трекинга привычек и действий.  
Код открытый; данные каждого пользователя изолированы через Row Level Security в Supabase.

---

## Быстрый старт (self-hosted)

### 1. Создайте Supabase проект

1. Зайдите на [supabase.com](https://supabase.com) и создайте новый проект.
2. Скопируйте из **Settings → API**:
   - `Project URL`
   - `anon public` ключ

### 2. Примените миграции

В **Supabase Dashboard → SQL Editor** выполните по порядку все файлы из `supabase/migrations/`:

```
20250212000000_initial_schema.sql
20250219000000_drop_notes_column.sql
...
```

Или через CLI:

```bash
supabase db push
```

### 3. Настройте окружение

```bash
cp .env.example .env
# Отредактируйте .env — вставьте свои URL и anon key
```

### 4. Запустите проект

```bash
npm install
npm run dev
```

---

## Модель безопасности

### Как защищены данные пользователей

Проект не имеет собственного backend-сервера. Вся защита строится на двух уровнях:

1. **Supabase Auth** — пользователь получает JWT-токен при входе.
2. **Row Level Security (RLS)** — каждая таблица Postgres содержит политики, которые разрешают доступ только к собственным данным пользователя (`auth.uid() = user_id`).

Даже если кто-то узнает `anon key` (он публичен и встроен в сборку — это нормально для Supabase), он не сможет прочитать чужие данные: RLS заблокирует запрос на уровне базы данных.

### Ключи

| Ключ | Где используется | Безопасно ли публиковать |
|------|-----------------|--------------------------|
| `anon key` | В браузере (VITE_SUPABASE_ANON_KEY) | Да — защищён RLS |
| `service_role` | Только серверные окружения | **Никогда в репо и фронтенд** |

### Что никогда не должно попасть в репозиторий

- `.env` с реальными значениями
- `service_role` ключ
- Дампы и бэкапы БД (`*.backup.gz`, `*.dump`, `*.sql.gz`)
- Любые личные данные пользователей

### Добавление новой таблицы

При создании новой таблицы в миграции обязательно:

```sql
ALTER TABLE public.my_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "my_table_select" ON public.my_table FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "my_table_insert" ON public.my_table FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "my_table_update" ON public.my_table FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "my_table_delete" ON public.my_table FOR DELETE
  USING ((select auth.uid()) = user_id);
```

Используйте `(select auth.uid())` вместо `auth.uid()` — вычисляется один раз на запрос, а не на каждую строку.

---

## Структура проекта

```
src/
  pages/        # Страницы (по одному файлу на маршрут)
  components/   # Переиспользуемые UI-компоненты
  lib/          # Supabase клиент, API, auth, утилиты
  styles/       # Глобальные стили
  types/        # TypeScript типы (database.ts генерируется из схемы)
docs/
  requirements/ # Продуктовые требования по экранам
  technical/    # Схема БД, API, деплой
supabase/
  migrations/   # SQL миграции (только схема, без данных)
```

---

## Деплой

Подробная инструкция: [`docs/technical/03-deploy-github-pages.md`](docs/technical/03-deploy-github-pages.md)

Для деплоя на GitHub Pages используется GitHub Actions workflow (`.github/workflows/deploy-pages.yml`).  
При деплое на другой хостинг достаточно собрать статику: `npm run build` → папка `dist/`.
