import type { BlockConfig, BlockRow, ValueJson } from '@/types/database'

/** Текущая дата в локальном часовом поясе в формате YYYY-MM-DD (для input type="date" и отображения). */
export function todayLocalISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Текущее время в локальном часовом поясе в формате HH:MM (для input type="time" и record_time). */
export function nowTimeLocal(): string {
  const d = new Date()
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function getBlockOptions(block: BlockRow): { id: string; label: string }[] {
  const fromConfig = (block.config as BlockConfig | null)?.options
  if (fromConfig?.length) return fromConfig.map((o) => ({ id: o.id, label: o.label }))
  return []
}

export function formatAnswer(
  value: ValueJson,
  block: BlockRow,
  optionsOverride?: { id: string; label: string }[]
): string {
  if ('number' in value && value.number !== undefined) return String(value.number)
  // Пустой или только пробелы — как «нет значения» (иначе в списках join даёт лишний «·» в конце).
  if ('text' in value) {
    const t = value.text ?? ''
    return t.trim() === '' ? '—' : t
  }
  if ('optionId' in value) {
    const opts = optionsOverride ?? getBlockOptions(block)
    const o = opts.find((x) => x.id === value.optionId)
    return o?.label ?? value.optionId ?? '—'
  }
  if ('optionIds' in value && Array.isArray(value.optionIds)) {
    const opts = optionsOverride ?? getBlockOptions(block)
    return value.optionIds.map((id) => opts.find((x) => x.id === id)?.label ?? id).join(', ') || '—'
  }
  if ('scaleValue' in value) return String(value.scaleValue)
  if ('yesNo' in value) return value.yesNo ? 'Выполнено' : 'Не выполнено'
  if ('durationHms' in value) return (value as { durationHms: string }).durationHms || '—'
  return '—'
}

/** Склонение "день/дня/дней" для числа n (только слово). */
export function pluralDays(n: number): 'день' | 'дня' | 'дней' {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return 'дней'
  if (mod10 === 1) return 'день'
  if (mod10 >= 2 && mod10 <= 4) return 'дня'
  return 'дней'
}

/** Склонение "запись/записи/записей" для числа n. */
export function pluralRecords(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 19) return `${n} записей`
  if (mod10 === 1) return `${n} запись`
  if (mod10 >= 2 && mod10 <= 4) return `${n} записи`
  return `${n} записей`
}

export function formatDate(isoDate: string): string {
  const d = new Date(isoDate + 'T12:00:00')
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const dayBeforeYesterday = new Date(today)
  dayBeforeYesterday.setDate(dayBeforeYesterday.getDate() - 2)
  if (d.toDateString() === today.toDateString()) return 'Сегодня'
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера'
  if (d.toDateString() === dayBeforeYesterday.toDateString()) return 'Позавчера'
  // Текущий год — только день и месяц; иначе добавляем год (без суффикса « г.» из Intl)
  const sameCalendarYear = d.getFullYear() === today.getFullYear()
  const parts = new Intl.DateTimeFormat(
    'ru-RU',
    sameCalendarYear
      ? { day: 'numeric', month: 'long' }
      : { day: 'numeric', month: 'long', year: 'numeric' },
  ).formatToParts(d)
  return parts
    .filter((p) => p.type === 'day' || p.type === 'month' || p.type === 'year')
    .map((p) => p.value)
    .join(' ')
}

/**
 * Дата и время записи для экрана просмотра: «27 марта 2026 в 14:30».
 * Дата — день, месяц полностью, год (четыре цифры); время — часы:минуты из `record_time`.
 */
export function formatRecordDateTimeDisplay(isoDate: string, recordTime?: string | null): string {
  const d = new Date(isoDate + 'T12:00:00')
  const dateStr = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .formatToParts(d)
    .filter((p) => p.type === 'day' || p.type === 'month' || p.type === 'year')
    .map((p) => p.value)
    .join(' ')
  const t = recordTime?.trim()
  if (!t) return dateStr
  const hm = t.length >= 5 ? t.slice(0, 5) : t
  return `${dateStr} в ${hm}`
}

/** Краткий превью ответа для списков (число, текст до 20–25 символов, галочки и т.д.) */
export function previewAnswer(value: ValueJson | null | undefined, maxTextLen = 20): string {
  if (!value) return '—'
  if ('number' in value && value.number !== undefined) return String(value.number)
  if ('text' in value && value.text) return value.text.length > maxTextLen ? value.text.slice(0, maxTextLen) + '…' : value.text
  if ('optionId' in value) return '✅'
  if ('optionIds' in value && Array.isArray(value.optionIds)) return value.optionIds.length ? `✓ ${value.optionIds.length}` : '—'
  if ('scaleValue' in value) return String(value.scaleValue)
  if ('yesNo' in value) return value.yesNo ? 'Выполнено' : 'Не выполнено'
  if ('durationHms' in value) return (value as { durationHms: string }).durationHms || '—'
  return '—'
}

/**
 * Все неудалённые блоки дела — только тип «да/нет», и есть хотя бы один такой блок.
 * Для таких дел превью в списке записей показываем «N из M», а не склейку подписей по блокам.
 */
export function isDeedOnlyYesNoBlocks(blocks: BlockRow[]): boolean {
  const active = blocks.filter((b) => !b.deleted_at)
  return active.length > 0 && active.every((b) => b.block_type === 'yes_no')
}

/**
 * Если {@link isDeedOnlyYesNoBlocks} — строка «сколько выполнено из скольких блоков»; иначе `null`.
 * Ответ без ключа или с `yesNo: false` не увеличивает счётчик выполненных.
 */
export function formatYesNoOnlyRecordListPreview(
  recordAnswers: { block_id: string; value_json: unknown }[],
  blocks: BlockRow[]
): string | null {
  if (!isDeedOnlyYesNoBlocks(blocks)) return null
  const active = blocks
    .filter((b) => !b.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order)
  const byBlockId = Object.fromEntries(recordAnswers.map((a) => [a.block_id, a.value_json])) as Record<
    string,
    unknown
  >
  let done = 0
  for (const block of active) {
    const v = byBlockId[block.id]
    if (v && typeof v === 'object' && v !== null && 'yesNo' in v && (v as { yesNo: boolean }).yesNo === true) {
      done++
    }
  }
  return `${done} из ${active.length}`
}

/**
 * Одна «ячейка» для строки превью в списке записей (RecordCard): пустой текст не даёт сегмента,
 * чтобы склейка через « · » не заканчивалась разделителем без текста.
 */
export function formatAnswerPreviewSegment(
  value: ValueJson,
  block: BlockRow | undefined
): string {
  if (!block) return previewAnswer(value)
  if ('text' in value && (value.text ?? '').trim() === '') return ''
  return formatAnswer(value, block)
}
