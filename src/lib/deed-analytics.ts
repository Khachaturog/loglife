import { todayLocalISO } from '@/lib/format-utils'

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** Приводим дату записи к YYYY-MM-DD (на случай нестандартной сериализации). */
function normalizeRecordDate(s: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s.trim())
  return m ? m[1] : s.trim()
}

/**
 * Предыдущий календарный день для YYYY-MM-DD в локальном часовом поясе.
 * Совпадает с тем, как формируются record_date в формах и todayLocalISO() —
 * в отличие от шага через Date.parse(d + 'Z') и getUTC*, который мог расходиться
 * с «вчера» по локальному календарю на крайних поясах.
 */
function previousCalendarDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const dt = new Date(y, mo - 1, d)
  dt.setDate(dt.getDate() - 1)
  const y2 = dt.getFullYear()
  const m2 = String(dt.getMonth() + 1).padStart(2, '0')
  const d2 = String(dt.getDate()).padStart(2, '0')
  return `${y2}-${m2}-${d2}`
}

/** Уникальные даты по записям, отсортированные по возрастанию. */
export function uniqueDatesSorted(
  records: { record_date: string }[]
): string[] {
  const set = new Set(records.map((r) => normalizeRecordDate(r.record_date)))
  return Array.from(set).sort()
}

/** Количество календарных дней между двумя YYYY-MM-DD (локальный календарь). */
function calendarDayDiff(a: string, b: string): number {
  const pa = /^(\d{4})-(\d{2})-(\d{2})/.exec(a)
  const pb = /^(\d{4})-(\d{2})-(\d{2})/.exec(b)
  if (!pa || !pb) {
    return Math.round((Date.parse(b + 'Z') - Date.parse(a + 'Z')) / MS_PER_DAY)
  }
  const da = new Date(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]))
  const db = new Date(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]))
  return Math.round((db.getTime() - da.getTime()) / MS_PER_DAY)
}

/**
 * Текущий стрик: подряд идущие календарные дни с хотя бы одной записью,
 * **заканчиваясь сегодня** (по локальной дате устройства).
 * Если сегодня ни одной записи нет — 0 (даже если вчера и раньше отмечались).
 */
export function currentStreak(records: { record_date: string }[]): number {
  const datesSet = new Set(records.map((r) => normalizeRecordDate(r.record_date)))
  const today = todayLocalISO()
  if (!datesSet.has(today)) return 0
  let count = 0
  let d = today
  while (datesSet.has(d)) {
    count++
    d = previousCalendarDay(d)
  }
  return count
}

/** Максимальный стрик: длина самой длинной серии подряд идущих дней с записями. */
export function maxStreak(records: { record_date: string }[]): number {
  const dates = uniqueDatesSorted(records)
  if (dates.length === 0) return 0
  let max = 1
  let current = 1
  for (let i = 1; i < dates.length; i++) {
    if (calendarDayDiff(dates[i - 1], dates[i]) === 1) {
      current++
      max = Math.max(max, current)
    } else {
      current = 1
    }
  }
  return max
}

/**
 * День недели для календарной даты записи: 0 = вс, …, 6 = сб.
 * Тот же приём, что в formatDate (`T12:00:00` без Z): «полдень» локального дня,
 * чтобы не путать день недели с UTC-полуночью (`…Z` + getUTCDay).
 */
function getRecordCalendarDayOfWeek(iso: string): number {
  const norm = normalizeRecordDate(iso)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(norm)) {
    const fallback = new Date(norm)
    return Number.isNaN(fallback.getTime()) ? 0 : fallback.getDay()
  }
  return new Date(`${norm}T12:00:00`).getDay()
}

/**
 * Сколько записей пришлось на будни (пн–пт) и на выходные (сб–вс).
 * Каждая запись считается отдельно; день недели — по `record_date`, как в истории.
 */
export function workdayWeekendCounts(records: { record_date: string }[]): {
  workday: number
  weekend: number
} {
  let workday = 0
  let weekend = 0
  for (const r of records) {
    const iso = normalizeRecordDate(r.record_date)
    const day = getRecordCalendarDayOfWeek(iso)
    if (day >= 1 && day <= 5) workday++
    else weekend++
  }
  return { workday, weekend }
}

