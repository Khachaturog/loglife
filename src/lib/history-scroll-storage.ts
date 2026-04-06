/** Ключ sessionStorage: позиция списка на `/history` (вкладка, до закрытия). */
export const HISTORY_SCROLL_STORAGE_KEY = 'log-life:history-window-scroll-y'

/** Записать текущий вертикальный скролл окна — вызывать при скролле и до ухода по ссылке на запись. */
export function persistHistoryListScrollY(): void {
  sessionStorage.setItem(HISTORY_SCROLL_STORAGE_KEY, String(window.scrollY))
}
