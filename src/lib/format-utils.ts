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
  if ('yesNo' in value) return value.yesNo ? 'Да' : 'Нет'
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
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).replace(/\s*г\.?\s*$/, '')
}

/** Краткий превью ответа для списков (число, текст до 20–25 символов, галочки и т.д.) */
export function previewAnswer(value: ValueJson | null | undefined, maxTextLen = 20): string {
  if (!value) return '—'
  if ('number' in value && value.number !== undefined) return String(value.number)
  if ('text' in value && value.text) return value.text.length > maxTextLen ? value.text.slice(0, maxTextLen) + '…' : value.text
  if ('optionId' in value) return '✅'
  if ('optionIds' in value && Array.isArray(value.optionIds)) return value.optionIds.length ? `✓ ${value.optionIds.length}` : '—'
  if ('scaleValue' in value) return String(value.scaleValue)
  if ('yesNo' in value) return value.yesNo ? 'Да' : 'Нет'
  if ('durationHms' in value) return (value as { durationHms: string }).durationHms || '—'
  return '—'
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
