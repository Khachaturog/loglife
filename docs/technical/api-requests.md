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
| api.deeds | `create()` | deeds (в т.ч. `analytics_config`, `quick_add_defaults_enabled`), blocks | DeedFormPage |
| api.deeds | `update()` | deeds (в т.ч. `analytics_config`, `quick_add_defaults_enabled`), blocks | DeedFormPage |
| api.deeds | `delete()` | deeds | DeedViewPage |
| api.deeds | `deleteBlock()` | deeds, blocks | DeedFormPage |
| api.deeds | `records(deedId)` | deeds, records, record_answers | DeedViewPage, export-csv |
| api.deeds | `recentRecords(deedId, limit?)` | deeds, records, record_answers | FillFormPage |
| api.deeds | `recordsByDeedIds(ids)` | deeds, records, record_answers | DeedsListPage |
| api.deeds | `listAllRecordsWithDeedInfo()` | records, record_answers, deeds | HistoryPage |
| api.deeds | `createRecord()` | deeds, records, record_answers | FillFormPage, DeedCard, DeedViewPage (быстрое добавление из дефолтов) |
| api.records | `get(id)` | records, record_answers, deeds | RecordViewPage |
| api.records | `update()` | records, record_answers, deeds | RecordViewPage |

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
- DeedsListPage — **N раз** (по одному на каждое дело)
- HistoryPage — **N раз**
- DeedViewPage — 1 раз
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
| 2 | recordsByDeedIds | deeds, records, record_answers |

**Итого:** 2 запроса

---

### HistoryPage

| # | Запрос | Таблицы |
|---|--------|---------|
| 1 | listAllRecordsWithDeedInfo | records, record_answers, deeds |

**Итого:** 1 запрос

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

## 5. Оптимизированные запросы

| Страница | Количество запросов | Комментарий |
|----------|---------------------|-------------|
| DeedsListPage | 2 | listWithBlocks + recordsByDeedIds |
| HistoryPage | 1 | listAllRecordsWithDeedInfo (join) |
| export-csv | 1 + 2N | list + get×N + records×N (потенциал для оптимизации) |
