import type { BlockRow, RecordRow, ValueJson } from '@/types/database'
import { todayLocalISO } from '@/lib/format-utils'

/** Запись с ответами, как приходит в списке на главной и на странице дела (без полного RecordAnswerRow). */
export type RecordWithAnswersLoose = RecordRow & {
  record_answers?: { block_id: string; value_json: unknown }[]
}

// --- Логика отображения "N сегодня · N всего" на карточке дела ---
//
// • Если есть блоки number / scale / duration:
//   – несколько таких блоков, или среди них есть duration → считаем КОЛИЧЕСТВО ЗАПИСЕЙ (сегодня / всего).
//   – ровно один блок (число или шкала, без duration) → СУММА значений по этому блоку.
//
// • Если числовых блоков нет (только «Да/Нет», текст, выбор и т.д.), но блоки в деле есть
//   → КОЛИЧЕСТВО ЗАПИСЕЙ — иначе превью было бы 0 при наличии записей.
//
// • Блоков нет → 0 и 0.

function getNumericBlocks(blocks: BlockRow[]): BlockRow[] {
  return (blocks ?? []).filter(
    (b) => b.block_type === 'number' || b.block_type === 'scale' || b.block_type === 'duration'
  )
}

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

function getValueFromAnswer(valueJson: ValueJson, blockType: 'number' | 'scale' | 'duration'): number {
  if (blockType === 'number' && 'number' in valueJson) return Number(valueJson.number) || 0
  if (blockType === 'scale' && 'scaleValue' in valueJson) return Number(valueJson.scaleValue) || 0
  if (blockType === 'duration' && 'durationHms' in valueJson) {
    const hms = (valueJson as { durationHms: string }).durationHms
    const [h, m, s] = (hms ?? '0:0:0').split(':').map((x) => parseInt(x, 10) || 0)
    return h * 3600 + m * 60 + s
  }
  return 0
}

export function getDeedDisplayNumbers(
  blocks: BlockRow[],
  records: RecordWithAnswersLoose[],
): { today: number; month: number; total: number } {
  const numericBlocks = getNumericBlocks(blocks)
  const todayStr = getTodayDateString()
  const { monthStart, monthEnd } = getCurrentMonthLocalRange()

  if (numericBlocks.length === 0) {
    const blockList = blocks ?? []
    if (blockList.length === 0) {
      return { today: 0, month: 0, total: 0 }
    }
    return getRecordCountMetrics(records)
  }

  // For duration, or multiple numeric blocks: show record count
  const hasDuration = numericBlocks.some((b) => b.block_type === 'duration')
  const useCount = numericBlocks.length > 1 || hasDuration
  if (useCount) {
    return getRecordCountMetrics(records)
  }

  const singleBlock = numericBlocks[0]
  const blockId = singleBlock.id
  const blockType = singleBlock.block_type as 'number' | 'scale' | 'duration'

  let sumToday = 0
  let sumMonth = 0
  let sumTotal = 0
  for (const rec of records) {
    const answer = rec.record_answers?.find((a) => a.block_id === blockId)
    const value = answer ? getValueFromAnswer(answer.value_json as ValueJson, blockType) : 0
    sumTotal += value
    if (rec.record_date === todayStr) sumToday += value
    if (rec.record_date >= monthStart && rec.record_date <= monthEnd) sumMonth += value
  }
  return { today: sumToday, month: sumMonth, total: sumTotal }
}
