import type { BlockRow, RecordRow } from '@/types/database'
import { getRecordAnswerNumericValue, resolveNumericBlockByConfigId } from '@/lib/deed-analytics-config'
import { todayLocalISO } from '@/lib/format-utils'

/** Запись с ответами, как приходит в списке на главной и на странице дела (без полного RecordAnswerRow). */
export type RecordWithAnswersLoose = RecordRow & {
  record_answers?: { block_id: string; value_json: unknown }[]
}

// Сегодня / месяц / всего: явный числовой блок в сводке — сумма, иначе количество записей.

function getTodayDateString(): string {
  return todayLocalISO()
}

/** Границы текущего календарного месяца в локальных ISO-датах (YYYY-MM-DD). */
function getCurrentMonthLocalRange(): { monthStart: string; monthEnd: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const monthEndDate = new Date(year, month + 1, 0).getDate()
  const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(monthEndDate).padStart(2, '0')}`
  return { monthStart, monthEnd }
}

/** Сколько записей сегодня, в текущем месяце и всего (для сводки без числового блока). */
export function getRecordCountMetrics(
  records: RecordWithAnswersLoose[],
): { today: number; month: number; total: number } {
  const todayStr = getTodayDateString()
  const { monthStart, monthEnd } = getCurrentMonthLocalRange()
  const total = records.length
  const today = records.filter((r) => r.record_date === todayStr).length
  const month = records.filter(
    (r) => r.record_date >= monthStart && r.record_date <= monthEnd,
  ).length
  return { today, month, total }
}

/**
 * Сегодня, текущий месяц и всего.
 * `summaryBlockId` — явный блок сводки; null или неизвестный id дают количество записей.
 */
export function getDeedDisplayNumbers(
  blocks: BlockRow[],
  records: RecordWithAnswersLoose[],
  summaryBlockId: string | null,
): { today: number; month: number; total: number } {
  const block = resolveNumericBlockByConfigId(blocks, summaryBlockId)
  if (!block) return getRecordCountMetrics(records)

  const todayStr = getTodayDateString()
  const { monthStart, monthEnd } = getCurrentMonthLocalRange()
  let sumToday = 0
  let sumMonth = 0
  let sumTotal = 0
  for (const rec of records) {
    const value = getRecordAnswerNumericValue(rec, block)
    sumTotal += value
    if (rec.record_date === todayStr) sumToday += value
    if (rec.record_date >= monthStart && rec.record_date <= monthEnd) sumMonth += value
  }
  return { today: sumToday, month: sumMonth, total: sumTotal }
}
