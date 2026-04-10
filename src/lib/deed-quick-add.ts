/**
 * Быстрое создание записи из дефолтов блоков (короткое «+» / удержание — форма).
 */
import type { DeedWithBlocks, ValueJson } from '@/types/database'
import { getCompleteDefaultAnswers, isQuickAddDefaultsAvailable } from '@/lib/block-default-value'

/** Удержание «+» — открыть форму заполнения (короткое нажатие = запись с дефолтами). */
export const QUICK_ADD_FROM_DEFAULTS_LONG_PRESS_MS = 500

/** Включена настройка дела и у всех блоков есть валидные дефолты. */
export function deedQuickAddFromDefaultsActive(
  deed: Pick<DeedWithBlocks, 'blocks'> & { quick_add_defaults_enabled?: boolean },
): boolean {
  return (deed.quick_add_defaults_enabled ?? false) && isQuickAddDefaultsAvailable(deed.blocks)
}

/** Ответы для createRecord или null, если быстрый режим недоступен. */
export function getQuickAddRecordAnswers(deed: DeedWithBlocks): Record<string, ValueJson> | null {
  if (!deedQuickAddFromDefaultsActive(deed)) return null
  return getCompleteDefaultAnswers(deed.blocks)
}
