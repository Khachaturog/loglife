/** Действия записи, которые можно закрепить кнопками в шапке. Порядок — порядок в каталоге (меню и вкладка). */
export const RECORD_HEADER_ACTION_IDS = ['edit', 'new', 'duplicate', 'delete', 'help'] as const

export type RecordHeaderActionId = (typeof RECORD_HEADER_ACTION_IDS)[number]

/** Пока человек не менял вкладку «Быстрый доступ». */
export const DEFAULT_RECORD_HEADER_PINNED: RecordHeaderActionId[] = ['edit']

export const RECORD_HEADER_ACTION_LABEL: Record<RecordHeaderActionId, string> = {
  edit: 'Редактировать',
  new: 'Новая запись',
  duplicate: 'Дублировать',
  delete: 'Удалить',
  help: 'Справка',
}

const ALLOWED = new Set<string>(RECORD_HEADER_ACTION_IDS)

function isActionId(value: string): value is RecordHeaderActionId {
  return ALLOWED.has(value)
}

/**
 * Приводит значение из формы или из БД к массиву закреплений.
 * Не массив (null, объект, строка) — дефолт `['edit']`.
 * Массив: неизвестные id отбрасываются, дубликаты схлопываются, остаётся не больше двух.
 * Пустой массив остаётся пустым.
 */
export function normalizeRecordHeaderPinned(raw: unknown): RecordHeaderActionId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_RECORD_HEADER_PINNED]
  const out: RecordHeaderActionId[] = []
  for (const item of raw) {
    if (typeof item !== 'string' || !isActionId(item) || out.includes(item)) continue
    out.push(item)
    if (out.length === 2) break
  }
  return out
}

/** Строки вкладки: сначала закреплённые в своём порядке, затем выключенные в порядке каталога. */
export function recordHeaderActionRows(
  pinned: readonly RecordHeaderActionId[],
): { id: RecordHeaderActionId; pinned: boolean }[] {
  const pinSet = new Set(pinned)
  return [
    ...pinned.map((id) => ({ id, pinned: true as const })),
    ...RECORD_HEADER_ACTION_IDS.filter((id) => !pinSet.has(id)).map((id) => ({
      id,
      pinned: false as const,
    })),
  ]
}
