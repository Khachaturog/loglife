import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { Button, Dialog, Flex, Heading, IconButton, Table, Text } from '@radix-ui/themes'
import { CircleQuestionMark, Info } from 'lucide-react'
import { AppBar } from '@/components/AppBar'
import { todayLocalISO } from '@/lib/format-utils'
import {
  PRODUCTION_CALENDAR_HELP_URL,
  PRODUCTION_CALENDAR_YEAR,
  getMonthWorkNorm,
  getProductionDayKind,
  isoWeekNumber,
  type ProductionDayKind,
} from '@/lib/production-calendar-2027'
import layoutStyles from '@/styles/layout.module.css'
import styles from './ProductionCalendarPage.module.css'

const MONTH_NAMES = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
] as const

/** Неделя с понедельника. Индексы 5 и 6 — суббота и воскресенье. */
const WEEKDAY_LABELS = ['п', 'в', 'с', 'ч', 'п', 'с', 'в'] as const
const WEEKEND_COLUMNS = new Set([5, 6])

const KIND_LABEL: Record<ProductionDayKind, string> = {
  work: 'рабочий',
  short: 'сокращённый',
  off: 'нерабочий',
}

const BAR_CLASS: Record<ProductionDayKind, string> = {
  work: styles.barWork,
  short: styles.barShort,
  off: styles.barOff,
}

/**
 * Ячейки месяца: null — пустое место до 1-го и после последнего числа.
 * Смещение считается от понедельника.
 */
type MonthWeek = {
  week: number
  days: (number | null)[]
}

/** Строки месяца: номер недели и 7 ячеек, неделя с понедельника. */
function monthWeeks(year: number, monthIndex: number): MonthWeek[] {
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const leading = (firstWeekday + 6) % 7
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < leading; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: MonthWeek[] = []
  for (let i = 0; i < cells.length; i += 7) {
    const days = cells.slice(i, i + 7)
    const sample = days.find((day) => day != null)
    weeks.push({
      week: sample == null ? 0 : isoWeekNumber(year, monthIndex, sample),
      days,
    })
  }
  return weeks
}

function isoDate(year: number, monthIndex: number, day: number): string {
  const month = String(monthIndex + 1).padStart(2, '0')
  const dayText = String(day).padStart(2, '0')
  return `${year}-${month}-${dayText}`
}

/** Месяц, который при открытии ставим по центру. Вне 2027 — январь. */
function focusMonthIndex(todayISO: string): number {
  if (!todayISO.startsWith(`${PRODUCTION_CALENDAR_YEAR}-`)) return 0
  const month = Number(todayISO.slice(5, 7))
  if (month >= 1 && month <= 12) return month - 1
  return 0
}

/**
 * Виджет «Производственный календарь 2027».
 * Месяцы в одной вертикальной ленте; под датой полоска типа дня.
 */
export function ProductionCalendarPage() {
  const todayISO = todayLocalISO()
  const monthIndex = focusMonthIndex(todayISO)
  const [statsMonth, setStatsMonth] = useState<number | null>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const monthRefs = useRef<(HTMLElement | null)[]>([])
  const monthNorm = statsMonth == null ? null : getMonthWorkNorm(statsMonth)

  // Январь и соседние первые месяцы остаются у начала ленты — пустой отступ сверху не нужен.
  // Более поздний месяц 2027 сдвигаем к центру только за счёт месяцев выше него.
  useLayoutEffect(() => {
    if (monthIndex === 0) return
    const scroller = scrollerRef.current
    const month = monthRefs.current[monthIndex]
    if (!scroller || !month) return

    const scrollerTop = scroller.getBoundingClientRect().top
    const monthTop = month.getBoundingClientRect().top
    const delta = monthTop - scrollerTop - (scroller.clientHeight - month.offsetHeight) / 2
    scroller.scrollTop = Math.max(0, scroller.scrollTop + delta)
  }, [monthIndex])

  return (
    <Flex direction="column" className={`${layoutStyles.pageContainer} ${styles.pageRoot}`}>
      <AppBar
        backHref="/widgets"
        title={String(PRODUCTION_CALENDAR_YEAR)}
        actions={
          <IconButton
            size="3"
            color="gray"
            variant="classic"
            radius="full"
            asChild
          >
            <a
              href={PRODUCTION_CALENDAR_HELP_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="Справка"
            >
              <CircleQuestionMark size={16} />
            </a>
          </IconButton>
        }
      />

      <div ref={scrollerRef} className={styles.scroller}>
        <div className={styles.track}>
          <Flex className={styles.legend} gap="4" justify="center" wrap="wrap">
            <Flex align="center" gap="2">
              <span className={`${styles.bar} ${styles.barWork} ${styles.legendBar}`} />
              <Text size="2" color="gray">Рабочий</Text>
            </Flex>
            <Flex align="center" gap="2">
              <span className={`${styles.bar} ${styles.barShort} ${styles.legendBar}`} />
              <Text size="2" color="gray">Сокращённый</Text>
            </Flex>
            <Flex align="center" gap="2">
              <span className={`${styles.bar} ${styles.barOff} ${styles.legendBar}`} />
              <Text size="2" color="gray">Нерабочий</Text>
            </Flex>
          </Flex>

          {MONTH_NAMES.map((name, index) => (
            <section
              key={name}
              ref={(node) => {
                monthRefs.current[index] = node
              }}
              className={styles.month}
              aria-label={name}
            >
              <Flex align="center" justify="between" pr="3">
                <Heading as="h2" size="7">{name}</Heading>
                <IconButton
                  type="button"
                  size="4"
                  color="gray"
                  variant="ghost"
                  aria-label={`Нормы за ${name}`}
                  onClick={() => setStatsMonth(index)}
                >
                  <Info size={16} />
                </IconButton>
              </Flex>

              <div className={styles.grid}>
                <span className={styles.weekNum} aria-hidden />
                {WEEKDAY_LABELS.map((label, weekdayIndex) => (
                  <Text
                    key={`${name}-${weekdayIndex}`}
                    as="span"
                    size="2"
                    color={WEEKEND_COLUMNS.has(weekdayIndex) ? 'red' : 'gray'}
                    className={styles.weekday}
                  >
                    {label}
                  </Text>
                ))}

                {monthWeeks(PRODUCTION_CALENDAR_YEAR, index).map((week) => (
                  <Fragment key={week.week}>
                    <span className={styles.weekNum} aria-label={`Неделя ${week.week}`}>
                      <Text as="span" size="2" color="gray">{week.week}</Text>
                    </span>
                    {week.days.map((day, weekdayIndex) => {
                      if (day == null) {
                        return <div key={`empty-${week.week}-${weekdayIndex}`} className={styles.cell} />
                      }

                      const date = isoDate(PRODUCTION_CALENDAR_YEAR, index, day)
                      const kind = getProductionDayKind(date)
                      const isToday = date === todayISO
                      // Красным — нерабочий день. Рабочая суббота (20 февраля) остаётся обычного цвета.

                      return (
                        <div
                          key={date}
                          className={styles.cell}
                          aria-label={`${day} ${name}, ${kind ? KIND_LABEL[kind] : ''}${isToday ? ', сегодня' : ''}`}
                        >
                          <div className={`${styles.dayNum} ${isToday ? styles.today : ''}`}>
                            <Text
                              as="span"
                              size="3"
                              weight={isToday ? 'medium' : 'regular'}
                              color={!isToday && kind === 'off' ? 'red' : undefined}
                              style={isToday ? { color: 'white' } : undefined}
                            >
                              {day}
                            </Text>
                          </div>
                          {kind && <span className={`${styles.bar} ${BAR_CLASS[kind]}`} />}
                        </div>
                      )
                    })}
                  </Fragment>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <Dialog.Root open={statsMonth != null} onOpenChange={(open) => { if (!open) setStatsMonth(null) }}>
        <Dialog.Content
          className={styles.statsDialog}
        >
          <Dialog.Title>{statsMonth == null ? '' : MONTH_NAMES[statsMonth]}</Dialog.Title>
          {monthNorm && (
            <Table.Root size="2" className={styles.statsTable}>
              <Table.Body>
                <Table.Row>
                  <Table.RowHeaderCell>Календарные дни</Table.RowHeaderCell>
                  <Table.Cell justify="end">{monthNorm.calendarDays}</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.RowHeaderCell>Рабочие дни</Table.RowHeaderCell>
                  <Table.Cell justify="end">{monthNorm.workDays}</Table.Cell>
                </Table.Row>
                <Table.Row>
                  <Table.RowHeaderCell>Выходные и праздничные дни</Table.RowHeaderCell>
                  <Table.Cell justify="end">{monthNorm.offDays}</Table.Cell>
                </Table.Row>
                {monthNorm.hoursByWeek.map((row) => (
                  <Table.Row key={row.weeklyHours}>
                    <Table.RowHeaderCell>{row.weeklyHours}-часовая неделя, ч</Table.RowHeaderCell>
                    <Table.Cell justify="end">{row.hoursLabel}</Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          )}
          <Flex justify="end" mt="auto" pt="4">
            <Dialog.Close>
              <Button type="button" size="3" color="gray" variant="surface">Закрыть</Button>
            </Dialog.Close>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  )
}
