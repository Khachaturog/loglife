import { todayLocalISO } from '@/lib/format-utils'

const MS_PER_DAY = 24 * 60 * 60 * 1000

// ─── Heatmap ────────────────────────────────────────────────────────────────

export interface DeedHeatmapCell {
  date: string
  value: number
  level: 0 | 1 | 2 | 3 | 4
  isToday: boolean
  isFuture: boolean
}

export interface DeedHeatmapMonthLabel {
  key: string
  weekIndex: number
  label: string
}

export interface DeedHeatmapResult {
  cells: DeedHeatmapCell[]
  monthLabels: DeedHeatmapMonthLabel[]
  maxCount: number
  requestedWeeks: number
}

function isoFromLocalDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Сдвигает ISO-дату на `days` дней (локальный календарь). */
function shiftDays(iso: string, days: number): string {
  const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!p) return iso
  const d = new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3]))
  d.setDate(d.getDate() + days)
  return isoFromLocalDate(d)
}

/** Понедельник недели, в которую попадает дата. */
function weekMonday(iso: string): string {
  const p = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!p) return iso
  const d = new Date(Number(p[1]), Number(p[2]) - 1, Number(p[3]))
  const jsDay = d.getDay() // 0=вс..6=сб
  const diffToMon = jsDay === 0 ? -6 : 1 - jsDay
  d.setDate(d.getDate() + diffToMon)
  return isoFromLocalDate(d)
}

/**
 * Строит данные для тепловой карты активности.
 * Показывает `visibleWeeks` недель заканчивая текущей; строки — Пн…Вс.
 * Уровни 1–4 делятся квантилями по max-значению за все дни.
 *
 * @param activity - записи активности: каждый элемент может быть отдельной записью
 *                   (value=1 для «факт», или числовое значение из блока)
 */
export function buildDeedHeatmap(
  activity: { record_date: string; value: number }[],
  visibleWeeks: number,
): DeedHeatmapResult {
  const today = todayLocalISO()
  const currentMon = weekMonday(today)

  // Начало сетки: понедельник `visibleWeeks - 1` недель назад
  const startMon = shiftDays(currentMon, -(visibleWeeks - 1) * 7)

  // Суммируем активность по дате
  const actMap = new Map<string, number>()
  for (const a of activity) {
    const d = normalizeRecordDate(a.record_date)
    actMap.set(d, (actMap.get(d) ?? 0) + a.value)
  }

  let maxCount = 0
  for (const v of actMap.values()) {
    if (v > maxCount) maxCount = v
  }

  const cells: DeedHeatmapCell[] = []
  const monthLabels: DeedHeatmapMonthLabel[] = []
  let lastMonth = -1

  for (let w = 0; w < visibleWeeks; w++) {
    for (let row = 0; row < 7; row++) {
      const date = shiftDays(startMon, w * 7 + row)
      const isFuture = date > today
      const value = isFuture ? 0 : (actMap.get(date) ?? 0)

      let level: 0 | 1 | 2 | 3 | 4 = 0
      if (!isFuture && maxCount > 0 && value > 0) {
        const ratio = value / maxCount
        if (ratio <= 0.25) level = 1
        else if (ratio <= 0.5) level = 2
        else if (ratio <= 0.75) level = 3
        else level = 4
      }

      cells.push({ date, value, level, isToday: date === today, isFuture })

      // Подпись месяца — только в строке Пн (row=0), при смене месяца
      if (row === 0) {
        const month = new Date(`${date}T12:00:00`).getMonth()
        if (month !== lastMonth) {
          lastMonth = month
          const label = new Intl.DateTimeFormat('ru-RU', { month: 'short' })
            .format(new Date(`${date}T12:00:00`))
            .replace('.', '')
          monthLabels.push({ key: `${date}-m`, weekIndex: w, label })
        }
      }
    }
  }

  return { cells, monthLabels, maxCount, requestedWeeks: visibleWeeks }
}

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

