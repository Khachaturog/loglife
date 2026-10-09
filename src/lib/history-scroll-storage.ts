/** Ключ sessionStorage: позиция списка на `/history` (вкладка, до закрытия). */
export const HISTORY_SCROLL_STORAGE_KEY = 'log-life:history-window-scroll-y'

/** Нижняя граница уже загруженного окна истории (YYYY-MM-DD), чтобы вернуть хвост вместе со скроллом. */
export const HISTORY_LOADED_FROM_STORAGE_KEY = 'log-life:history-loaded-from'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Записать текущий вертикальный скролл окна — вызывать при скролле и до ухода по ссылке на запись. */
export function persistHistoryListScrollY(): void {
  sessionStorage.setItem(HISTORY_SCROLL_STORAGE_KEY, String(window.scrollY))
}

export function persistHistoryLoadedFrom(fromDate: string): void {
  sessionStorage.setItem(HISTORY_LOADED_FROM_STORAGE_KEY, fromDate)
}

export function readHistoryLoadedFrom(): string | null {
  const raw = sessionStorage.getItem(HISTORY_LOADED_FROM_STORAGE_KEY)
  if (!raw || !ISO_DATE.test(raw)) return null
  return raw
}
