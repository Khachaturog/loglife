import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Flex, Heading, IconButton, Text } from '@radix-ui/themes'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RefreshCw, X } from 'lucide-react'
import type { DeedWithBlocks, RecordAnswerRow, RecordRow } from '@/types/database'
import type { ValueJson } from '@/types/database'
import { api } from '@/lib/api'
import { DeedCard, SlotCount } from '@/components/DeedCard'
import {
  deedQuickAddFromDefaultsActive,
  getQuickAddRecordAnswers,
  QUICK_ADD_FROM_DEFAULTS_LONG_PRESS_MS,
} from '@/lib/deed-quick-add'
import {
  addDaysLocalISO,
  blocksIncludedInRecordPreview,
  formatAnswerPreviewSegment,
  formatYesNoOnlyRecordListPreview,
  nowTimeLocal,
  todayLocalISO,
} from '@/lib/format-utils'
import { triggerHaptic } from '@/lib/haptics'
import { useDelayedActionLoader } from '@/lib/use-delayed-action-loader'
import deedCardStyles from './DeedCard.module.css'
import styles from './DeedsCalendarView.module.css'

/** Запись с ответами — тот же набор, что отдаёт recordsByDeedIds. */
type CalendarRecord = RecordRow & { record_answers?: RecordAnswerRow[] }

/** scroll — столбцы шире экрана; fit — вся сетка в 100% ширины, в шапке только эмодзи. */
export type CalendarColumnsMode = 'scroll' | 'fit'

type DeedsCalendarViewProps = {
  /** Дела после фильтра категории, в порядке списка (created_at с сервера). */
  deeds: DeedWithBlocks[]
  /** Растёт после pull-to-refresh на главной — перечитать месяц. */
  reloadToken: number
  /** Обновить счётчик «сегодня» на карточках, если пользователь вернётся в список. */
  onRecordsRefresh?: (deedId: string) => void | Promise<void>
  columnsMode: CalendarColumnsMode
}

const MONTHS_RU = [
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

const MONTHS_SHORT_RU = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'] as const

const WEEKDAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'] as const

/** Двухбуквенные русские подписи. Неделя с воскресенья: индекс = Date.getDay(). */
const WEEKDAY_LETTERS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'] as const

/** Сколько символов превью держим в ячейке; остальное — в title и многоточие. */
const CELL_PREVIEW_MAX = 16

const SWIPE_PX = 48

type MonthDay = {
  iso: string
  label: string
  weekday: number
}

function monthBounds(year: number, monthIndex: number): { fromDate: string; toDate: string; days: MonthDay[] } {
  const last = new Date(year, monthIndex + 1, 0).getDate()
  const days: MonthDay[] = []
  for (let day = 1; day <= last; day++) {
    const weekday = new Date(year, monthIndex, day).getDay()
    const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    days.push({
      iso,
      label: String(day).padStart(2, '0'),
      weekday,
    })
  }
  return { fromDate: days[0]?.iso ?? '', toDate: days[days.length - 1]?.iso ?? '', days }
}

function shortenPreview(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1).trimEnd()}…`
}

/**
 * Текст ячейки: последняя запись дня (список уже отсортирован по времени убыванием).
 * Пустой день — «·». Запись без текстового превью (например, только картинка) — «✓».
 */
function cellPreview(
  record: CalendarRecord | undefined,
  deed: DeedWithBlocks,
  max = CELL_PREVIEW_MAX,
): { short: string; full: string } {
  if (!record) return { short: '·', full: '' }
  const blocks = deed.blocks ?? []
  const yesNoOnly = formatYesNoOnlyRecordListPreview(record.record_answers ?? [], blocks)
  const previewBlockIds = new Set(blocksIncludedInRecordPreview(blocks).map((block) => block.id))
  const joined =
    yesNoOnly ??
    (record.record_answers ?? [])
      .filter((answer) => {
        const block = blocks.find((item) => item.id === answer.block_id)
        if (!block) return true
        return previewBlockIds.has(block.id)
      })
      .sort((a, b) => {
        const orderA = blocks.find((item) => item.id === a.block_id)?.sort_order ?? 0
        const orderB = blocks.find((item) => item.id === b.block_id)?.sort_order ?? 0
        return orderA - orderB
      })
      .map((answer) =>
        formatAnswerPreviewSegment(answer.value_json as ValueJson, blocks.find((item) => item.id === answer.block_id)),
      )
      .filter((part) => part.trim() !== '')
      .join(' · ')
  const full = (joined ?? '').trim()
  if (!full) return { short: '✓', full: '' }
  return { short: shortenPreview(full, max), full }
}

/** Заголовок столбца. В режиме «по ширине» остаётся только эмодзи, чтобы сетка влезла без скролла. */
function columnLabel(deed: DeedWithBlocks, fit: boolean): string {
  const emoji = deed.emoji?.trim()
  if (fit) {
    if (emoji) return emoji
    return deed.name.trim().slice(0, 1) || '·'
  }
  if (emoji && emoji !== '📋') return emoji
  const name = deed.name.trim()
  if (name.length <= 8) return name
  return `${name.slice(0, 7)}…`
}

function latestOnDate(records: CalendarRecord[] | undefined, iso: string): CalendarRecord | undefined {
  return records?.find((record) => record.record_date === iso)
}

function isoParts(iso: string): { year: number; monthIndex: number; day: number; weekday: number } {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1, day ?? 1)
  return { year, monthIndex: date.getMonth(), day: date.getDate(), weekday: date.getDay() }
}

/**
 * Календарь на главной: строки — все дни месяца, столбцы — дела.
 * Дата открывает лист дня. Ячейка отмечает запись: короткое нажатие как «Отметить», удержание — форма.
 */
export function DeedsCalendarView({
  deeds,
  reloadToken,
  onRecordsRefresh,
  columnsMode,
}: DeedsCalendarViewProps) {
  const navigate = useNavigate()
  const todayIso = todayLocalISO()
  const todayDate = new Date()
  const [year, setYear] = useState(() => todayDate.getFullYear())
  const [month, setMonth] = useState(() => todayDate.getMonth())
  const [recordsByDeedId, setRecordsByDeedId] = useState<Record<string, CalendarRecord[]>>({})
  const [loading, setLoading] = useState(deeds.length > 0)
  const [error, setError] = useState<string | null>(null)
  const [markError, setMarkError] = useState<string | null>(null)
  const [openIso, setOpenIso] = useState<string | null>(null)
  /** Держим лист на экране, пока доигрывает закрытие. */
  const [sheetIso, setSheetIso] = useState<string | null>(null)
  const [sheetShown, setSheetShown] = useState(false)
  const openIsoRef = useRef<string | null>(null)
  openIsoRef.current = openIso
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [sheetHeight, setSheetHeight] = useState(0)
  const { spinnerVisible, run: runQuickAdd } = useDelayedActionLoader()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const todayRowRef = useRef<HTMLTableRowElement>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const requestIdRef = useRef(0)
  const alignedIsoRef = useRef<string | null>(null)
  const pendingRef = useRef(false)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressConsumedRef = useRef(false)
  const setSheetNode = useCallback((node: HTMLDivElement | null) => {
    sheetRef.current = node
  }, [])

  const { fromDate, toDate, days } = useMemo(() => monthBounds(year, month), [year, month])
  const isCurrentMonth = year === todayDate.getFullYear() && month === todayDate.getMonth()
  const deedIdsKey = deeds.map((deed) => deed.id).join(',')
  const fit = columnsMode === 'fit'

  useEffect(() => {
    if (openIso) {
      setSheetIso(openIso)
      const frame = requestAnimationFrame(() => setSheetShown(true))
      return () => cancelAnimationFrame(frame)
    }
    setSheetShown(false)
    // grid-template-rows иногда не шлёт transitionend, и панель «Сегодня» не возвращалась.
    const timer = window.setTimeout(() => {
      if (!openIsoRef.current) setSheetIso(null)
    }, 520)
    return () => window.clearTimeout(timer)
  }, [openIso])

  useLayoutEffect(() => {
    if (!openIso) {
      setSheetHeight(0)
      return
    }
    const el = sheetRef.current
    if (!el) return
    const measure = () => setSheetHeight(el.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [openIso, deedIdsKey])

  useEffect(() => {
    if (!openIso) alignedIsoRef.current = null
  }, [openIso])

  // Лист забирает низ экрана — строку открытого дня держим в верхней части оставшейся сетки.
  useLayoutEffect(() => {
    if (!openIso || sheetHeight === 0) return
    if (alignedIsoRef.current === openIso) return
    const scroller = scrollerRef.current
    const row = scroller?.querySelector<HTMLElement>(`[data-iso="${openIso}"]`)
    if (!scroller || !row) return
    const rowRect = row.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const rowCenter = rowRect.top + rowRect.height / 2
    const target = scrollerRect.top + scrollerRect.height * 0.38
    scroller.scrollTop += rowCenter - target
    alignedIsoRef.current = openIso
  }, [openIso, sheetHeight, year, month])

  useEffect(() => {
    if (deeds.length === 0 || !fromDate || !toDate) {
      requestIdRef.current += 1
      setRecordsByDeedId({})
      setLoading(false)
      setError(null)
      return
    }
    const requestId = ++requestIdRef.current
    const ids = deeds.map((deed) => deed.id)
    setRecordsByDeedId({})
    setLoading(true)
    setError(null)
    void api.deeds
      .recordsByDeedIds(ids, { skipDeedCheck: true, fromDate, toDate })
      .then((byId) => {
        if (requestIdRef.current !== requestId) return
        setRecordsByDeedId(byId)
      })
      .catch((err: unknown) => {
        if (requestIdRef.current !== requestId) return
        setError(err instanceof Error ? err.message : 'Не удалось загрузить месяц')
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return
        setLoading(false)
      })
  }, [deedIdsKey, fromDate, toDate, reloadToken, deeds])

  useEffect(() => {
    if (!isCurrentMonth || loading || openIso) return
    const row = todayRowRef.current
    const scroller = scrollerRef.current
    if (!row || !scroller) return
    const rowRect = row.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const nextTop =
      scroller.scrollTop + (rowRect.top - scrollerRect.top) - scroller.clientHeight / 2 + rowRect.height / 2
    scroller.scrollTo({ top: Math.max(0, nextTop) })
  }, [isCurrentMonth, year, month, loading, deedIdsKey, openIso])

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
    setOpenIso(null)
  }

  function toggleDay(iso: string) {
    setOpenIso((current) => (current === iso ? null : iso))
  }

  function openToday() {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth())
    setOpenIso(todayLocalISO())
  }

  function shiftOpenDay(delta: number) {
    if (!openIso) return
    const next = addDaysLocalISO(openIso, delta)
    if (next > todayLocalISO()) return
    const parts = isoParts(next)
    setYear(parts.year)
    setMonth(parts.monthIndex)
    setOpenIso(next)
  }

  async function refreshDeedMonth(deedId: string) {
    const byId = await api.deeds.recordsByDeedIds([deedId], {
      skipDeedCheck: true,
      fromDate,
      toDate,
    })
    setRecordsByDeedId((prev) => ({ ...prev, [deedId]: byId[deedId] ?? [] }))
    await onRecordsRefresh?.(deedId)
  }

  function clearLongPress() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  useEffect(() => () => clearLongPress(), [])

  function openFill(deedId: string, iso: string) {
    navigate(`/deeds/${deedId}/fill`, { state: { fillRecordDate: iso } })
  }

  /** Короткое нажатие ячейки — та же отметка, что кнопка на карточке. */
  async function markCell(deed: DeedWithBlocks, iso: string) {
    const answers = getQuickAddRecordAnswers(deed)
    if (!answers) {
      openFill(deed.id, iso)
      return
    }
    if (pendingRef.current) return
    const key = `${deed.id}:${iso}`
    pendingRef.current = true
    setPendingKey(key)
    setMarkError(null)
    try {
      await runQuickAdd(async () => {
        await api.deeds.createRecord(deed.id, {
          record_date: iso,
          record_time: nowTimeLocal(),
          answers,
        })
        await refreshDeedMonth(deed.id)
      })
      triggerHaptic('success', { intensity: 1 })
    } catch (err) {
      setMarkError(err instanceof Error ? err.message : 'Не удалось добавить запись')
    } finally {
      pendingRef.current = false
      setPendingKey(null)
    }
  }

  function onCellPointerDown(event: React.PointerEvent<HTMLButtonElement>, deed: DeedWithBlocks, iso: string) {
    if (iso > todayIso || pendingRef.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    longPressConsumedRef.current = false
    clearLongPress()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      longPressConsumedRef.current = true
      openFill(deed.id, iso)
      triggerHaptic('medium', { intensity: 0.45 })
    }, QUICK_ADD_FROM_DEFAULTS_LONG_PRESS_MS)
  }

  function onCellClick(event: React.MouseEvent<HTMLButtonElement>, deed: DeedWithBlocks, iso: string) {
    event.preventDefault()
    if (longPressConsumedRef.current) {
      longPressConsumedRef.current = false
      return
    }
    if (iso > todayIso || pendingRef.current) return
    if (deedQuickAddFromDefaultsActive(deed)) void markCell(deed, iso)
    else openFill(deed.id, iso)
  }

  return (
    <Flex direction="column" className={`${styles.calendar} ${openIso ? styles.calendarWithSheet : ''}`} gap="3">
      <Heading key={`${year}-${month}`} as="h2" size="8" className={styles.monthTitle}>
        {MONTHS_RU[month]} {year}
      </Heading>

      {deeds.length === 0 ? (
        <Text as="p" size="2" color="gray">
          В этой категории нет дел
        </Text>
      ) : (
        <div
          ref={scrollerRef}
          className={`${styles.scroller} ${styles.hideScrollbar} ${fit ? styles.scrollerFit : ''}`}
        >
          <table className={`${styles.table} ${fit ? styles.tableFit : styles.tableScroll}`}>
            <thead>
              <tr>
                <th className={styles.corner} scope="col" aria-label="День" />
                {deeds.map((deed) => (
                  <th key={deed.id} className={styles.colHead} scope="col" title={deed.name}>
                    <span className={styles.colHeadLabel}>{columnLabel(deed, fit)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => {
                const isToday = day.iso === todayIso
                const isFuture = day.iso > todayIso
                const isWeekend = day.weekday === 0 || day.weekday === 6
                const isOpen = openIso === day.iso
                const rowClass = [
                  isWeekend ? styles.weekend : '',
                  isOpen ? styles.dayOpen : '',
                  isFuture ? styles.future : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <tr
                    key={day.iso}
                    data-iso={day.iso}
                    ref={isToday ? todayRowRef : undefined}
                    className={rowClass || undefined}
                  >
                    <th className={styles.dateCell} scope="row">
                      <button
                        type="button"
                        className={`${styles.cellButton} ${styles.dateButton}`}
                        aria-pressed={isOpen}
                        aria-label={`${day.label} ${WEEKDAY_LETTERS[day.weekday]}`}
                        disabled={isFuture}
                        onClick={() => toggleDay(day.iso)}
                      >
                        <span className={styles.dateLabel}>
                          <span className={styles.dateNum}>
                            {isToday ? <span className={styles.dateNumMark} aria-hidden="true" /> : null}
                            <span className={isToday ? styles.dateNumTextToday : styles.dateNumText}>{day.label}</span>
                          </span>
                          <span className={styles.dateWeek}>{WEEKDAY_LETTERS[day.weekday]}</span>
                        </span>
                      </button>
                    </th>
                    {deeds.map((deed) => {
                      const preview = cellPreview(latestOnDate(recordsByDeedId[deed.id], day.iso), deed)
                      const empty = preview.short === '·'
                      const cellKey = `${deed.id}:${day.iso}`
                      const spinning = pendingKey === cellKey && spinnerVisible
                      const quick = deedQuickAddFromDefaultsActive(deed)
                      return (
                        <td key={deed.id} className={styles.cell}>
                          <button
                            type="button"
                            className={styles.cellButton}
                            disabled={isFuture}
                            aria-busy={pendingKey === cellKey}
                            title={
                              isFuture
                                ? preview.full || deed.name
                                : [preview.full, quick ? 'Нажать — запись с дефолтами. Удерживать — форма' : 'Нажать — форма записи']
                                    .filter(Boolean)
                                    .join('. ')
                            }
                            aria-label={
                              empty
                                ? `Отметить «${deed.name}», ${day.iso}`
                                : `Отметить «${deed.name}», ${day.iso}, ${preview.full || preview.short}`
                            }
                            onPointerDown={(event) => onCellPointerDown(event, deed, day.iso)}
                            onPointerUp={clearLongPress}
                            onPointerCancel={clearLongPress}
                            onPointerLeave={clearLongPress}
                            onClick={(event) => onCellClick(event, deed, day.iso)}
                          >
                            <span className={`${styles.cellText}${empty && !spinning && !isToday ? ` ${styles.cellDot}` : ''}`}>
                              {spinning ? (
                                <RefreshCw className={deedCardStyles.iconSpin} size={14} />
                              ) : isToday && empty ? (
                                <span className={styles.todayStar} aria-hidden="true">
                                  ·
                                </span>
                              ) : (
                                <Text size="1" color={empty ? 'gray' : undefined}>
                                  {preview.short}
                                </Text>
                              )}
                            </span>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {error || markError ? (
        <Text as="p" size="2" color="crimson" role="alert">
          {error ?? markError}
        </Text>
      ) : null}

      {!openIso ? (
        <Flex align="center" gap="2" className={styles.dock}>
          <IconButton
            type="button"
            size="3"
            color="gray"
            variant="soft"
            radius="large"
            aria-label="Предыдущий месяц"
            onClick={() => shiftMonth(-1)}
          >
            <ChevronUp size={18} />
          </IconButton>
          <IconButton
            type="button"
            size="3"
            color="gray"
            variant="soft"
            radius="large"
            aria-label="Следующий месяц"
            onClick={() => shiftMonth(1)}
          >
            <ChevronDown size={18} />
          </IconButton>
          <Button
            type="button"
            size="3"
            color="gray"
            // classic + highContrast у серого — почти чёрная заливка. surface — белое поле, highContrast держит тёмную подпись.
            variant="classic"
            highContrast
            radius="large"
            className={styles.todayButton}
            onClick={openToday}
          >
            Сегодня
          </Button>
        </Flex>
      ) : null}

      {sheetIso && deeds.length > 0 ? (
        <div
          className={`${styles.sheetSlot} ${sheetShown ? styles.sheetSlotOpen : ''} ${openIso ? '' : styles.sheetSlotClosing}`}
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget || event.propertyName !== 'grid-template-rows') return
            if (!openIsoRef.current) setSheetIso(null)
          }}
        >
          <DaySheet
            onRoot={setSheetNode}
            iso={openIso ?? sheetIso}
            deeds={deeds}
            recordsByDeedId={recordsByDeedId}
            loading={loading}
            onShiftDay={shiftOpenDay}
            onQuickAdded={refreshDeedMonth}
            onClose={() => setOpenIso(null)}
          />
        </div>
      ) : null}
    </Flex>
  )
}

type DaySheetProps = {
  onRoot: (node: HTMLDivElement | null) => void
  iso: string
  deeds: DeedWithBlocks[]
  recordsByDeedId: Record<string, CalendarRecord[]>
  loading: boolean
  onShiftDay: (delta: number) => void
  onQuickAdded: (deedId: string) => Promise<void>
  onClose: () => void
}

/** Лист дня: карточки дел и свайп на соседний день. Шапка липнет при прокрутке списка. */
function DaySheet({ onRoot, iso, deeds, recordsByDeedId, loading, onShiftDay, onQuickAdded, onClose }: DaySheetProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef(0)
  const startRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const axisRef = useRef<'x' | 'y' | null>(null)
  const pendingShiftRef = useRef<number | null>(null)
  const swipedRef = useRef(false)

  const prevIso = addDaysLocalISO(iso, -1)
  const nextIso = addDaysLocalISO(iso, 1)
  const nextBlocked = nextIso > todayLocalISO()

  /** Сдвиг ленты без setState: иначе каждый кадр перерисовывает все карточки и свайп замирает. */
  function paintTrack(px: number, animate: boolean) {
    const el = trackRef.current
    if (!el) return
    el.style.transition = animate ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
    el.style.transform = `translate3d(calc(-33.333% + ${px}px), 0, 0)`
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    startRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    axisRef.current = null
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = startRef.current
    if (!start || event.pointerId !== start.pointerId) return
    const dx = event.clientX - start.x
    const dy = event.clientY - start.y
    if (!axisRef.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      if (axisRef.current === 'x') {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    }
    if (axisRef.current !== 'x') return
    // В будущее ленту не тянем: после сегодняшнего дня сдвиг влево останавливается.
    const nextDx = dx < 0 && nextBlocked ? 0 : dx
    dragRef.current = nextDx
    paintTrack(nextDx, false)
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>) {
    const start = startRef.current
    if (!start || event.pointerId !== start.pointerId) return
    const dx = dragRef.current
    const horizontal = axisRef.current === 'x'
    startRef.current = null
    axisRef.current = null
    dragRef.current = 0
    if (!horizontal) {
      paintTrack(0, false)
      return
    }
    const width = viewportRef.current?.clientWidth ?? 0
    const reduced =
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (width > 0 && Math.abs(dx) > SWIPE_PX) {
      const dir = dx < 0 ? 1 : -1
      if (dir > 0 && nextBlocked) {
        paintTrack(0, true)
        return
      }
      swipedRef.current = true
      if (reduced) {
        paintTrack(0, false)
        onShiftDay(dir)
        return
      }
      pendingShiftRef.current = dir
      paintTrack(dir > 0 ? -width : width, true)
      return
    }
    paintTrack(0, true)
  }

  function onTransitionEnd(event: React.TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return
    const dir = pendingShiftRef.current
    if (dir == null) return
    pendingShiftRef.current = null
    paintTrack(0, false)
    onShiftDay(dir)
  }

  function onClickCapture(event: React.MouseEvent<HTMLDivElement>) {
    if (!swipedRef.current) return
    swipedRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  const panes = [prevIso, iso, nextIso]
  const header = isoParts(iso)

  // Высота списка не кратна карточке: лишний хвост уходит в отступ панели, а не режет следующую строку.
  useLayoutEffect(() => {
    const body = bodyRef.current
    const sheet = body?.parentElement
    if (!body || !sheet) return
    const basePad = 10
    const fit = () => {
      const pane = body.querySelector(`.${styles.sheetPane}`)
      const list = pane?.querySelector(`.${styles.sheetList}`)
      const card = list?.firstElementChild
      if (!(pane instanceof HTMLElement) || !(list instanceof HTMLElement) || !(card instanceof HTMLElement)) return
      body.style.paddingBottom = `${basePad}px`
      const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0
      const padTop = Number.parseFloat(getComputedStyle(list).paddingTop) || 0
      const cardH = card.getBoundingClientRect().height
      const row = cardH + gap
      if (row <= 0) return
      const available = pane.clientHeight
      const contentH = list.getBoundingClientRect().height
      // Весь список влез — не раздувать низ пустым хвостом.
      if (contentH <= available + 1) {
        body.style.paddingBottom = `${basePad}px`
        return
      }
      const count = Math.floor((available - padTop + gap) / row)
      if (count < 1) return
      const fitted = padTop + count * cardH + (count - 1) * gap
      const sliver = Math.max(0, available - fitted)
      body.style.paddingBottom = `${basePad + sliver}px`
    }
    fit()
    let timer = 0
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(fit, 60)
    })
    observer.observe(sheet)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [iso, deeds.length])

  return (
    <div
      ref={onRoot}
      className={styles.sheet}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClickCapture={onClickCapture}
    >
      {/* Шапка не едет со свайпом: день недели сменяется, число крутится как счётчик. */}
      <div className={styles.sheetHeader}>
        <Heading as="h3" size="6" className={styles.sheetTitle}>
          {WEEKDAYS_RU[header.weekday]}
        </Heading>
        <div className={styles.sheetHeaderAside}>
          {/* Стрелки у даты, не у названия: на телефоне день меняется свайпом. */}
          <div className={styles.dayNav}>
            <IconButton
              type="button"
              size="2"
              color="gray"
              variant="soft"
              radius="large"
              aria-label="Предыдущий день"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onShiftDay(-1)}
            >
              <ChevronLeft size={16} />
            </IconButton>
            <IconButton
              type="button"
              size="2"
              color="gray"
              variant="soft"
              radius="large"
              aria-label="Следующий день"
              disabled={nextBlocked}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onShiftDay(1)}
            >
              <ChevronRight size={16} />
            </IconButton>
          </div>
          <span className={styles.sheetBadge}>
            <span className={styles.sheetBadgeDay}>
              <SlotCount value={header.day} startAtValue />
            </span>
            <span className={styles.sheetBadgeMonth}>{MONTHS_SHORT_RU[header.monthIndex]}</span>
          </span>
          <IconButton
            type="button"
            size="2"
            color="gray"
            variant="soft"
            radius="large"
            aria-label="Закрыть"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onClose}
          >
            <X size={16} />
          </IconButton>
        </div>
      </div>
      <div ref={bodyRef} className={styles.sheetBody}>
      <div ref={viewportRef} className={styles.sheetViewport}>
        <div ref={trackRef} className={styles.sheetTrack} onTransitionEnd={onTransitionEnd}>
          {panes.map((paneIso) => {
            return (
              <div key={paneIso} className={`${styles.sheetPane} ${styles.hideScrollbar}`}>
                <Flex direction="column" gap="2" className={styles.sheetList}>
                  {deeds.map((deed) => {
                    const preview = cellPreview(latestOnDate(recordsByDeedId[deed.id], paneIso), deed, 28)
                    const text = preview.short === '·' || preview.short === '✓' ? '' : preview.full
                    return (
                      <DeedCard
                        key={deed.id}
                        layout="outline"
                        deed={deed}
                        records={recordsByDeedId[deed.id] ?? []}
                        countersLoading={loading && paneIso.slice(0, 7) === iso.slice(0, 7)}
                        recordDate={paneIso}
                        dayPreview={text}
                        onRecordsRefresh={onQuickAdded}
                      />
                    )
                  })}
                </Flex>
              </div>
            )
          })}
        </div>
      </div>
      </div>
    </div>
  )
}
