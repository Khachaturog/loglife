import type { RecordAnswerRow, RecordRow, ValueJson } from '@/types/database'

/** Записи с вложенными ответами — тот же shape, что у `api.deeds.recentRecords`. */
export type RecordWithAnswersForSuggestions = RecordRow & { record_answers?: RecordAnswerRow[] }

/** Сколько уникальных чипов максимум (порядок появления в списке — по недавности записей). */
const MAX_UNIQUE_CHIPS = 7

/**
 * Значения числового блока из последних записей: обход от новых к старым,
 * дедуп по значению, только number > 0 (как на форме заполнения).
 * На экране чипы сортируются от большего к меньшему.
 */
export function recentNumberSuggestions(
  records: RecordWithAnswersForSuggestions[],
  blockId: string,
): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const rec of records) {
    const row = (rec.record_answers ?? []).find((a) => a.block_id === blockId)
    if (!row) continue
    const json = row.value_json as ValueJson
    if (!('number' in json) || typeof json.number !== 'number') continue
    const n = json.number
    if (!Number.isFinite(n) || n <= 0) continue
    if (seen.has(n)) continue
    seen.add(n)
    out.push(n)
    if (out.length >= MAX_UNIQUE_CHIPS) break
  }
  return out.slice().sort((a, b) => b - a)
}

/**
 * optionId одиночного выбора из последних записей; только id, которые есть в текущем config блока
 * (удалённые варианты в истории не предлагаем).
 * На экране чипы сортируются по подписи по убыванию (locale `ru`).
 */
export function recentSingleSelectSuggestions(
  records: RecordWithAnswersForSuggestions[],
  blockId: string,
  validOptionIds: Set<string>,
  labelById: Record<string, string>,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const rec of records) {
    const row = (rec.record_answers ?? []).find((a) => a.block_id === blockId)
    if (!row) continue
    const json = row.value_json as ValueJson
    if (!('optionId' in json) || typeof json.optionId !== 'string' || !json.optionId) continue
    const id = json.optionId
    if (!validOptionIds.has(id)) continue
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= MAX_UNIQUE_CHIPS) break
  }
  return out.slice().sort((a, b) => {
    const la = labelById[a] ?? a
    const lb = labelById[b] ?? b
    return lb.localeCompare(la, 'ru', { sensitivity: 'base' })
  })
}
