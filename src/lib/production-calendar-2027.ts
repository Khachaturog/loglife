/**
 * Производственный календарь 2027, пятидневная неделя.
 * Переносы — постановление Правительства РФ от 17.09.2026 № 1187.
 * Одинаковый для всех пользователей, в базу не пишется.
 */

export type ProductionDayKind = 'work' | 'short' | 'off'

export const PRODUCTION_CALENDAR_YEAR = 2027

/** Официальный производственный календарь КонсультантПлюс (PDF). */
export const PRODUCTION_CALENDAR_HELP_URL =
  'https://static.consultant.ru/obj/file/calendar/calendar_2027.pdf'

/** Длины недели, для которых в справке считают норму часов. */
const WEEKLY_HOUR_NORMS = [40, 39, 36, 35, 33, 30, 24, 20, 18] as const

/**
 * Будни, которые в 2027 нерабочие: праздники по ТК и перенесённые выходные.
 * 2 и 3 января здесь нет — это суббота и воскресенье, они и так выходные;
 * сам выходной с них перенесён на 5 ноября и 31 декабря.
 */
const OFF_WEEKDAYS = new Set([
  '2027-01-01',
  '2027-01-04',
  '2027-01-05',
  '2027-01-06',
  '2027-01-07',
  '2027-01-08',
  '2027-02-22',
  '2027-02-23',
  '2027-03-08',
  '2027-05-03',
  '2027-05-10',
  '2027-06-14',
  '2027-11-04',
  '2027-11-05',
  '2027-12-31',
])

/** Рабочие дни на час короче. 20 февраля — рабочая суббота (выходной перенесён на 22-е). */
const SHORT_DAYS = new Set([
  '2027-02-20',
  '2027-04-30',
  '2027-06-11',
  '2027-11-03',
])

/**
 * Тип дня. Сокращённые проверяются раньше выходных:
 * 20 февраля — суббота, но рабочая и короче на час.
 * Вне 2027 и для несуществующей даты — null.
 */
export function getProductionDayKind(isoDate: string): ProductionDayKind | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year !== PRODUCTION_CALENDAR_YEAR || month < 1 || month > 12) return null

  // Локальная дата без сдвига UTC: 2027-01-01 остаётся 1 января.
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null
  }

  if (SHORT_DAYS.has(isoDate)) return 'short'
  if (OFF_WEEKDAYS.has(isoDate)) return 'off'

  const weekday = date.getDay()
  if (weekday === 0 || weekday === 6) return 'off'
  return 'work'
}

/**
 * Номер недели ISO (понедельник–воскресенье).
 * 1 января 2027 — пятница 53-й недели, 4 января — понедельник 1-й.
 */
export function isoWeekNumber(year: number, monthIndex: number, day: number): number {
  const date = new Date(Date.UTC(year, monthIndex, day))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const dayOffset = (date.getTime() - yearStart.getTime()) / 86400000
  return Math.ceil((dayOffset + 1) / 7)
}

export type MonthWorkNorm = {
  calendarDays: number
  workDays: number
  offDays: number
  /** Норма часов: (часы недели / 5) × рабочие дни − 1 ч за каждый сокращённый. */
  hoursByWeek: { weeklyHours: number; hoursLabel: string }[]
}

function formatHoursFromTenths(tenths: number): string {
  const whole = Math.trunc(tenths / 10)
  const fraction = Math.abs(tenths % 10)
  if (fraction === 0) return String(whole)
  return `${whole},${fraction}`
}

/** Сводка месяца для модалки: дни и норма часов при разной длине недели. */
export function getMonthWorkNorm(monthIndex: number): MonthWorkNorm {
  const calendarDays = new Date(PRODUCTION_CALENDAR_YEAR, monthIndex + 1, 0).getDate()
  let workDays = 0
  let shortDays = 0

  for (let day = 1; day <= calendarDays; day += 1) {
    const month = String(monthIndex + 1).padStart(2, '0')
    const dayText = String(day).padStart(2, '0')
    const kind = getProductionDayKind(`${PRODUCTION_CALENDAR_YEAR}-${month}-${dayText}`)
    if (kind === 'work' || kind === 'short') workDays += 1
    if (kind === 'short') shortDays += 1
  }

  return {
    calendarDays,
    workDays,
    offDays: calendarDays - workDays,
    hoursByWeek: WEEKLY_HOUR_NORMS.map((weeklyHours) => {
      // Десятые доли часа целым числом, чтобы 135,8 не превращалось в 135,7999….
      const tenths = 2 * weeklyHours * workDays - 10 * shortDays
      return { weeklyHours, hoursLabel: formatHoursFromTenths(tenths) }
    }),
  }
}
