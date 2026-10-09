# Запросы к API (Supabase)

Документация всех HTTP-запросов и вызовов Supabase в приложении Log Life.

---

## Обзор

| Источник | Запрос | Таблицы | Где используется |
|----------|--------|---------|------------------|
| Auth | `getSession()` | — | AuthProvider (первая гидратация сессии), каждый вызов api |
| Auth | `onAuthStateChange` | — | AuthProvider |
| Auth | `signOut()` | — | ProfilePage |
| api.deeds | `list()` | deeds | export-csv |
| api.deeds | `listWithBlocks()` | deeds, blocks | DeedsListPage |
| api.deeds | `get(id)` | deeds, blocks | DeedViewPage, FillFormPage, DeedFormPage, RecordViewPage, export-csv |
| api.deeds | `create()` | deeds (в т.ч. `analytics_config`, `quick_add_defaults_enabled`, `record_header_pinned`), blocks | DeedFormPage |
| api.deeds | `update()` | deeds (в т.ч. `analytics_config`, `quick_add_defaults_enabled`, `record_header_pinned`), blocks | DeedFormPage |
| api.deeds | `applyBlockTypeChangeAndMigrateAnswers()` | blocks, record_answers, block_config_versions (+ дочерние при необходимости) | DeedFormPage (модалка смены типа блока) |
| api.deeds | `delete()` | deeds | DeedViewPage |
| api.deeds | `deleteBlock()` | deeds, blocks | DeedFormPage |
| api.deeds | `records(deedId)` | deeds, records, record_answers | DeedViewPage, DeedFormPage (модалка смены типа), export-csv |
| api.deeds | `recentRecords(deedId, limit?)` | deeds, records, record_answers | FillFormPage |
| api.deeds | `recordsByDeedIds(ids, { recordDate? })` | records, record_answers | DeedsListPage (на главной `record_date` = сегодня) |
| api.deeds | `listAllRecordsWithDeedInfo({ fromDate?, toDate? })` | records, record_answers, deeds | HistoryPage (диапазон `record_date`, оба края включительно) |
| api.deeds | `oldestRecordDateBefore(beforeDate)` | records, deeds | HistoryPage (есть ли записи старше границы) |
| api.deeds | `countAllRecords()` | records, deeds | HistoryPage (бейдж, без тел ответов) |
| api.deeds | `createRecord()` | deeds, records, record_answers | FillFormPage, DeedCard, DeedViewPage (быстрое добавление из дефолтов) |
| api.records | `get(id)` | records, record_answers, deeds | RecordViewPage |
| api.records | `update()` | records, record_answers, deeds | RecordViewPage |
| api.pomodoro | `getSettings()` | pomodoro_settings | PomodoroPage |
| api.pomodoro | `updateSettings()` | pomodoro_settings | PomodoroPage (длительность «Без проекта») |
| api.pomodoro | `listProjects()` | pomodoro_projects | PomodoroPage |
| api.pomodoro | `createProject()` / `updateProject()` / `deleteProject()` | pomodoro_projects | PomodoroPage |
| api.pomodoro | `createSession()` | pomodoro_sessions | PomodoroPage (конец или остановка сеанса) |
| api.pomodoro | `focusTotals()` | pomodoro_sessions | PomodoroPage |

---

## 1. Auth (Supabase Auth)

### `getSession()`

- **Используется:** App (через AuthProvider), каждый метод api (через `getUserIdOrThrow`)
- **Частота:** 1 раз при загрузке (далее api использует cachedUserId из AuthProvider)
- **Поведение:** до завершения первого `getSession()` в `AuthProvider` флаг `loading` остаётся `true`, чтобы не редиректить на `/login` пока Supabase успеет обновить сессию по refresh-токену (истёкший access-токен в localStorage сам по себе не означает «вышел из аккаунта»).

### `onAuthStateChange`

- **Используется:** AuthProvider
- **Subscription:** слушает события входа/выхода

### `signOut()`

- **Используется:** ProfilePage
- **Когда:** по клику «Выйти»

### Редирект после входа (`LoginPage`)

- Неавторизованный запрос к защищённому маршруту ведёт на `/login?redirect=<текущий путь>` (см. `App.tsx`).
- После успешного входа `LoginPage` переходит по `redirect`; если цель — `/profile` (в т.ч. с query), подставляется главная **`/`**, чтобы после логина открывался список дел, а не вкладка «Профиль».

---

## 2. Deeds API

### `api.deeds.list()`

**POST** (PostgREST): `GET /rest/v1/deeds`

```sql
SELECT * FROM deeds
WHERE user_id = :uid
ORDER BY created_at DESC
```

| Параметр | Описание |
|----------|----------|
| `user_id` | из `getSession()` |

**Используется:** HistoryPage, export-csv

---

### `api.deeds.listWithBlocks()`

**POST** (PostgREST): `GET /rest/v1/deeds`

```sql
SELECT *, blocks(*) FROM deeds
WHERE user_id = :uid
ORDER BY created_at DESC
```

Блоки фильтруются на клиенте: `deleted_at IS NULL`, сортировка по `sort_order`.

**Используется:** DeedsListPage

---

### `api.deeds.get(id)`

**POST** (PostgREST): `GET /rest/v1/deeds`

```sql
SELECT *, blocks(*) FROM deeds
WHERE id = :id AND user_id = :uid
```

Блоки фильтруются на клиенте: `deleted_at IS NULL`, сортировка по `sort_order`.

**Используется:** DeedViewPage, FillFormPage, DeedFormPage, RecordViewPage, export-csv

---

### `api.deeds.create(payload)`

**Запросы:**
1. `INSERT INTO deeds` — создание дела
2. `INSERT INTO blocks` — для каждого блока (по умолчанию 1 блок): в т.ч. `default_value`, `default_value_enabled`, `recent_suggestions_enabled`, jsonb `config` (для `single_select` — `singleSelectUi`: `select` | `checkbox`)

**Используется:** DeedFormPage (создание)

---

### `api.deeds.update(id, payload)`

**Запросы:**
1. `UPDATE deeds` — emoji, name, description
2. При изменении блоков: `SELECT blocks`, `UPDATE`/`INSERT`/soft-delete блоков (в `config` у `single_select` передаётся `singleSelectUi` при сохранении)

**Используется:** DeedFormPage (редактирование)

---

### `api.deeds.applyBlockTypeChangeAndMigrateAnswers(deedId, blockRow, migrations)`

**Запросы:**
1. `SELECT deeds`, `SELECT blocks` — проверка доступа и существования блока
2. `UPDATE blocks` — поля блока после смены типа (`block_type`, `config`, `default_value`, …)
3. Для каждой пары в `migrations`: `findOrCreateConfigVersion(blockRow)` (один раз на блок), `UPDATE record_answers` по `record_id` + `block_id` — `value_json`, `config_version_id`

**Используется:** DeedFormPage (подтверждение модалки смены типа блока)

---

### `api.deeds.delete(id)`

```sql
DELETE FROM deeds WHERE id = :id AND user_id = :uid
```

**Используется:** DeedViewPage

---

### `api.deeds.deleteBlock(deedId, blockId)`

**Запросы:**
1. `SELECT deeds` — проверка доступа
2. `UPDATE blocks SET deleted_at = now()` — soft delete

**Используется:** DeedFormPage

---

### `api.deeds.records(deedId)`

**Запросы:**
1. `SELECT deeds` — проверка доступа
2. `SELECT records, record_answers` — записи по делу

```sql
SELECT *, record_answers(*)
FROM records
WHERE deed_id = :deedId
ORDER BY record_date DESC, record_time DESC
```

**Используется:**
- DeedViewPage — 1 раз
- DeedFormPage — модалка смены типа блока
- export-csv — N раз

---

### `api.deeds.recentRecords(deedId, limit?)`

**Запросы:**
1. `SELECT deeds` — проверка доступа
2. `SELECT records, record_answers` — не более `limit` последних записей (по умолчанию 10), та же сортировка, что у `records`

```sql
SELECT *, record_answers(*)
FROM records
WHERE deed_id = :deedId
ORDER BY record_date DESC, record_time DESC
LIMIT :limit
```

**Используется:** FillFormPage (чипы «недавние значения» для числа и одиночного выбора)

---

### `api.deeds.listAllRecordsWithDeedInfo(range?)`

**Запросы:**
1. `SELECT records, record_answers, deeds, blocks` — записи пользователя. `fromDate` / `toDate` (YYYY-MM-DD), если заданы, ограничивают `record_date` включительно

```sql
SELECT *, record_answers(*), deeds!inner(emoji, name, blocks(*))
FROM records
WHERE deeds.user_id = auth.uid()
  AND record_date >= :fromDate -- только если fromDate задан
  AND record_date <= :toDate   -- только если toDate задан
ORDER BY record_date DESC, record_time DESC
```

**Используется:** HistoryPage — окно последних 7 дней, хвост при возврате на экран, порция 30 дней, обновление после удаления

---

### `api.deeds.oldestRecordDateBefore(beforeDate)`

**Запросы:**
1. `SELECT record_date` — одна строка с максимальной `record_date` строго меньше `beforeDate`. Пусто — старше границы записей нет

**Используется:** HistoryPage — нужно ли показывать «Показать раньше» и с какой даты начинать следующую порцию

---

### `api.deeds.countAllRecords()`

**Запросы:**
1. `HEAD` / `count=exact` по `records` пользователя, без строк ответов

**Используется:** HistoryPage — бейдж с общим числом записей

---

### `api.deeds.recordsByDeedIds(ids, opts?)`

**Запросы:**
1. Без `skipDeedCheck`: `SELECT deeds` — оставить только id текущего пользователя
2. `SELECT records, record_answers` — записи по этим делам. Если передан `recordDate` (YYYY-MM-DD) — только эта дата

```sql
SELECT *, record_answers(*)
FROM records
WHERE deed_id IN (:ids)
  AND record_date = :recordDate -- только если recordDate задан
ORDER BY record_date DESC, record_time DESC
```

**Используется:** DeedsListPage — второй запрос после списка дел и обновление одной карточки после быстрого «+»; оба раза с `recordDate` = локальное «сегодня» и `skipDeedCheck: true` (проверка deeds не нужна, RLS на records остаётся).

---

### `api.deeds.createRecord(deedId, payload)`

**Запросы:**
1. `SELECT deeds` — проверка доступа
2. `INSERT INTO records`
3. `INSERT INTO record_answers` — для каждого ответа

**Используется:** FillFormPage

---

## 3. Records API

### `api.records.get(id)`

**Запросы:**
1. `SELECT records, record_answers` — запись
2. `SELECT deeds` — проверка доступа (user_id)

**Используется:** RecordViewPage

---

### `api.records.update(id, payload)`

**Запросы:**
1. `SELECT records` — deed_id
2. `SELECT deeds` — проверка user_id
3. `UPDATE records` — дата, время, заметки
4. Для каждого ответа: `SELECT record_answers` → `UPDATE` или `INSERT`

**Используется:** RecordViewPage

---

## 4. Запросы по страницам

### DeedsListPage (главная)

| # | Запрос | Таблицы |
|---|--------|---------|
| 1 | listWithBlocks | deeds, blocks |
| 2 | recordsByDeedIds (`record_date` = сегодня) | records, record_answers |

**Итого:** 2 запроса

---

### HistoryPage

| # | Запрос | Таблицы |
|---|--------|---------|
| 1 | listAllRecordsWithDeedInfo (`record_date` ≥ сегодня − 6 дней) | records, record_answers, deeds |
| 2 | oldestRecordDateBefore (нижняя граница окна) | records, deeds |
| 3 | countAllRecords | records, deeds |
| 4 | listAllRecordsWithDeedInfo хвоста | records, record_answers, deeds |

Запросы 1–3 идут параллельно при открытии. Запрос 4 — только если в этой вкладке уже догружали период старше 7 дней (возврат со скроллом). «Показать раньше» или доскролл низа: снова `oldestRecordDateBefore`, затем `listAllRecordsWithDeedInfo` на 30 дней до этой даты, затем ещё одна проба.

**Итого:** 3 запроса на первый заход, дальше по мере догрузки

---

### DeedViewPage

| # | Запрос | Таблицы |
|---|--------|---------|
| 1 | deeds.get | deeds, blocks |
| 2 | deeds.records | deeds, records, record_answers |

**Итого:** 2 запроса (параллельно)

---

### FillFormPage

| # | Запрос | Таблицы |
|---|--------|---------|
| 1 | deeds.get | deeds, blocks |
| 2 | deeds.recentRecords | deeds, records, record_answers |

Загрузка: `get` и `recentRecords` параллельно (ошибка `recentRecords` не блокирует форму — чипы просто не показываются).

При отправке: createRecord (deeds + records + record_answers)

---

### DeedFormPage

| # | Запрос | Таблицы |
|---|--------|---------|
| 1 | deeds.get | deeds, blocks |

При сохранении: create или update (deeds + blocks)

---

### RecordViewPage

| # | Запрос | Таблицы |
|---|--------|---------|
| 1 | records.get | records, record_answers, deeds |
| 2 | deeds.get | deeds, blocks |

**Итого:** 2 запроса (последовательно)

---

### ProfilePage (экспорт CSV)

| # | Запрос | Таблицы |
|---|--------|---------|
| 1 | deeds.list | deeds |
| 2..N+1 | deeds.get | deeds, blocks |
| N+2..2N+1 | deeds.records | deeds, records, record_answers |

**Итого:** 1 + N + N = 1 + 2N запросов

---

## 5. Pomodoro API

Таблицы не связаны с `deeds`. Доступ только к своим строкам через RLS.

### `api.pomodoro.getSettings()`

```sql
SELECT * FROM pomodoro_settings WHERE user_id = :uid
```

Если строки нет — `INSERT` с `focus_seconds = 1500`.

### `api.pomodoro.updateSettings(focusSeconds)`

```sql
UPDATE pomodoro_settings
SET focus_seconds = :seconds, updated_at = now()
WHERE user_id = :uid
```

Секунды округляются до минут и зажимаются в 60…10800.

### `api.pomodoro.listProjects()`

```sql
SELECT * FROM pomodoro_projects
WHERE user_id = :uid
ORDER BY created_at DESC
```

### `api.pomodoro.createProject()` / `updateProject()` / `deleteProject()`

Создание и правка пишут `name`, `emoji`, `accent_color`, `focus_seconds`. Цвет должен быть hex из пресетов карточки дела. Удаление проекта не удаляет сеансы: `project_id` становится `NULL`.

### `api.pomodoro.createSession()`

```sql
INSERT INTO pomodoro_sessions (
  user_id, project_id, planned_seconds, actual_seconds, status, started_at, ended_at
) VALUES (...)
```

Вызов ничего не пишет, если план короче 300 секунд или факт равен 0. Если проект уже удалён (FK), повторная вставка идёт с `project_id = null`.

### `api.pomodoro.focusTotals(projectId)`

Читает `actual_seconds` и `started_at` сеансов пользователя. `projectId = null` — только строки без проекта. «Сегодня» считается по местной полуночи в клиенте.

---

## 6. Оптимизированные запросы

| Страница | Количество запросов | Комментарий |
|----------|---------------------|-------------|
| DeedsListPage | 2 | listWithBlocks + recordsByDeedIds за сегодня |
| HistoryPage | 3 | 7 дней + проба более старой даты + count; хвост и порции по 30 дней отдельно |
| export-csv | 1 + 2N | list + get×N + records×N (потенциал для оптимизации) |
