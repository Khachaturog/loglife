import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Box, Button, Card, Flex, IconButton, Text } from '@radix-ui/themes'
import { CircleCheck, Circle, RefreshCw } from 'lucide-react'
import type { DeedWithBlocks } from '@/types/database'
import type { RecordRow, RecordAnswerRow } from '@/types/database'
import { getDeedDisplayNumbers } from '@/lib/deed-utils'
import { deedQuickAddFromDefaultsActive, getQuickAddRecordAnswers, QUICK_ADD_FROM_DEFAULTS_LONG_PRESS_MS } from '@/lib/deed-quick-add'
import { api } from '@/lib/api'
import { nowTimeLocal, todayLocalISO } from '@/lib/format-utils'
import { triggerHaptic } from '@/lib/haptics'
import { useDelayedActionLoader } from '@/lib/use-delayed-action-loader'
import deedCardStyles from '@/components/DeedCard.module.css'

/** row — строка списка; stack — плитка в сетке (эмодзи, название, число «сегодня» в кнопке). */
export type DeedCardLayout = 'row' | 'stack'

const SLOT_GLYPHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function toSlotDigits(value: number): number[] {
  const safe = Math.max(0, Math.floor(value))
  return String(safe).split('').map((ch) => Number(ch))
}

function sameSlotDigits(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((digit, index) => digit === b[index])
}

/**
 * Число за сегодня: на кнопке плитки и под названием в списке.
 * Каждая цифра — лента 0–9, которая доезжает до новой. Ноль не крутим.
 */
function SlotCount({ value }: { value: number }) {
  const [digits, setDigits] = useState<number[]>([0])
  const digitsRef = useRef(digits)
  digitsRef.current = digits

  useEffect(() => {
    const target = toSlotDigits(value)
    if (prefersReducedMotion()) {
      setDigits(target)
      return
    }
    if (sameSlotDigits(digitsRef.current, target)) return

    const frames: number[] = []
    const schedule = (fn: () => void) => {
      frames.push(requestAnimationFrame(fn))
    }
    const prev = digitsRef.current
    // Новый разряд сначала показывается нулём, иначе он появится уже на итоговой цифре.
    if (target.length > prev.length) {
      const padded = Array.from({ length: target.length }, () => 0)
      for (let i = 0; i < prev.length; i++) {
        padded[padded.length - 1 - i] = prev[prev.length - 1 - i]
      }
      setDigits(padded)
      schedule(() => {
        schedule(() => setDigits(target))
      })
    } else {
      schedule(() => setDigits(target))
    }
    return () => {
      for (const id of frames) cancelAnimationFrame(id)
    }
  }, [value])

  return (
    <span className={deedCardStyles.slot}>
      {digits.map((digit, index) => {
        const place = digits.length - 1 - index
        return (
          <span key={place} className={deedCardStyles.slotDigit}>
            <span
              className={deedCardStyles.slotStrip}
              style={{ transform: `translateY(calc(${digit} * var(--slot-step) * -1))` }}
            >
              {SLOT_GLYPHS.map((glyph) => (
                <span key={glyph} className={deedCardStyles.slotCell}>
                  {glyph}
                </span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}

type DeedCardProps = {
  deed: DeedWithBlocks
  records: (RecordRow & { record_answers?: RecordAnswerRow[] })[]
  /** Второй запрос на главной ещё не вернул записи — не показываем ложные нули в счётчиках. */
  countersLoading?: boolean
  /** После успешного быстрого «+» — обновить счётчики на карточке. */
  onRecordsRefresh?: (deedId: string) => void | Promise<void>
  layout?: DeedCardLayout
}

/**
 * Карточка дела в списке.
 * Клик по карточке — просмотр дела (полноразмерная ссылка под контентом).
 * Кнопка — добавление записи (pointer-events только на кнопке).
 * Пустой день — кружок, день с записями — галочка.
 */
export function DeedCard({
  deed,
  records,
  countersLoading = false,
  onRecordsRefresh,
  layout = 'row',
}: DeedCardProps) {
  const navigate = useNavigate()
  const { today } = getDeedDisplayNumbers(deed.blocks ?? [], records)
  const { spinnerVisible, run: runQuickAddWithDelayedSpinner } = useDelayedActionLoader()

  const quickAddActive = useMemo(() => deedQuickAddFromDefaultsActive(deed), [deed])

  /** Быстрый «+»: лоадер с задержкой и минимальной длительностью — см. useDelayedActionLoader. */
  const [actionPending, setActionPending] = useState(false)
  const [quickAddError, setQuickAddError] = useState<string | null>(null)
  /** Число на кнопке плитки. Пока крутится спиннер, не обновляем — прокрутка видна после него. */
  const [stackCount, setStackCount] = useState(0)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** После срабатывания long press подавляем следующий click (иначе уйдёт в быстрый «+»). */
  const longPressConsumedClickRef = useRef(false)

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      clearLongPressTimer()
    }
  }, [])

  async function handleQuickAddFromDefaults(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const answers = getQuickAddRecordAnswers(deed)
    if (!answers || actionPending) return
    setActionPending(true)
    setQuickAddError(null)
    try {
      await runQuickAddWithDelayedSpinner(async () => {
        await api.deeds.createRecord(deed.id, {
          record_date: todayLocalISO(),
          record_time: nowTimeLocal(),
          answers,
        })
        await onRecordsRefresh?.(deed.id)
      })
      triggerHaptic('success', { intensity: 1 })
    } catch (err) {
      setQuickAddError(err instanceof Error ? err.message : 'Не удалось добавить запись')
    } finally {
      setActionPending(false)
    }
  }

  /** Удержание — через фиксированную паузу открываем форму (без ожидания отпускания), короткий тап — см. handlePlusClick. */
  function handlePlusPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (quickAddActive && actionPending) return
    longPressConsumedClickRef.current = false
    clearLongPressTimer()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      longPressConsumedClickRef.current = true
      navigate(`/deeds/${deed.id}/fill`)
      triggerHaptic('medium', { intensity: 0.45 })
    }, QUICK_ADD_FROM_DEFAULTS_LONG_PRESS_MS)
  }

  function handlePlusPointerEnd() {
    clearLongPressTimer()
  }

  function handlePlusClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (longPressConsumedClickRef.current) {
      longPressConsumedClickRef.current = false
      return
    }
    if (quickAddActive) {
      void handleQuickAddFromDefaults(e)
    } else {
      navigate(`/deeds/${deed.id}/fill`)
    }
  }

  const markedToday = !countersLoading && today > 0

  const deedOpenLabel = countersLoading
    ? `Открыть дело «${deed.name}»${deed.category ? `. ${deed.category}` : ''}. Статистика загружается`
    : `Открыть дело «${deed.name}»${deed.category ? `. ${deed.category}` : ''}. ${today} сегодня`

  const showSpinner = quickAddActive && actionPending && spinnerVisible
  const actionIdle = !actionPending

  // Пока спиннер на кнопке, число не меняем — барабан крутится, когда цифра снова видна.
  useEffect(() => {
    if (layout !== 'stack') return
    if (showSpinner) return
    const next = markedToday ? today : 0
    const id = requestAnimationFrame(() => setStackCount(next))
    return () => cancelAnimationFrame(id)
  }, [layout, showSpinner, markedToday, today])

  const actionLabel = actionPending
    ? 'Добавление записи'
    : countersLoading
      ? 'Добавить запись'
      : layout === 'stack' && !markedToday
        ? 'Отметить'
        : markedToday
          ? `Добавить запись, ${today} сегодня`
          : 'Добавить запись'

  const actionTitle = actionIdle
    ? quickAddActive
      ? 'Нажать — запись с дефолтами. Удерживать — форма с датой и временем'
      : 'Нажать — форма записи. Удерживать — та же форма после короткой паузы'
    : 'Добавление записи…'

  const pointerHandlers = actionIdle
    ? {
        onPointerDown: handlePlusPointerDown,
        onPointerUp: handlePlusPointerEnd,
        onPointerCancel: handlePlusPointerEnd,
        onPointerLeave: handlePlusPointerEnd,
        onClick: handlePlusClick,
      }
    : {
        onClick: (e: React.MouseEvent) => {
          e.preventDefault()
          e.stopPropagation()
        },
      }

  /** Плитка: кружок и «Отметить», либо галочка и число. Список: кружок или галочка. */
  const actionButton = layout === 'stack' ? (
    <Button
      type="button"
      size="3"
      variant="soft"
      color="gray"
      // highContrast={true}
      className={`${deedCardStyles.cardActionButton} ${deedCardStyles.pillActionButton}`}
      title={actionTitle}
      aria-label={actionLabel}
      disabled={!actionIdle}
      {...pointerHandlers}
    >
      {showSpinner ? (
        <RefreshCw className={deedCardStyles.iconSpin} size={16} />
      ) : markedToday ? (
        <CircleCheck size={16} />
      ) : (
        <Circle size={16} />
      )}
      {/* Барабан остаётся в дереве на время спиннера, чтобы не начинать прокрутку с нуля заново */}
      {stackCount > 0 || markedToday ? (
        <span className={showSpinner || !markedToday ? deedCardStyles.slotHidden : undefined} aria-hidden="true">
          <SlotCount value={stackCount} />
        </span>
      ) : null}
      {!showSpinner && !countersLoading && !markedToday ? 'Отметить' : null}
    </Button>
  ) : (
    <IconButton
      type="button"
      size="4"
      variant="soft"
      color="gray"
      className={deedCardStyles.cardActionButton}
      title={actionTitle}
      aria-label={actionLabel}
      disabled={!actionIdle}
      {...pointerHandlers}
    >
      {showSpinner ? (
        <RefreshCw className={deedCardStyles.iconSpin} size={16} />
      ) : markedToday ? (
        <CircleCheck size={16} />
      ) : (
        <Circle size={16} />
      )}
    </IconButton>
  )

  const quickAddErrorNode = quickAddError ? (
    <Text size="1" color="crimson" role="alert">
      {quickAddError}
    </Text>
  ) : null

  return (
    <Card
      className={`${deedCardStyles.cardNoPadding} ${deedCardStyles.cardInteractive}${
        layout === 'stack' ? ` ${deedCardStyles.cardStretch}` : ''
      }`}
    >
      <Box position="relative" height={layout === 'stack' ? '100%' : undefined}>
        {/* Вся карточка — переход к делу; клики проходят сквозь .cardContent и попадают сюда */}
        <Link
          to={`/deeds/${deed.id}`}
          className={deedCardStyles.cardHitArea}
          aria-label={deedOpenLabel}
        />
        {layout === 'stack' ? (
          <Flex direction="column" gap="2" p="3" height="100%" className={deedCardStyles.cardContent}>
            <Flex align="center" gap="2" minWidth="0" aria-hidden="true">
              {deed.emoji ? (
                <Text size="2" className={deedCardStyles.stackEmoji}>{deed.emoji}</Text>
              ) : null}
              <Text weight="medium" truncate className={deedCardStyles.stackTitle}>{deed.name}</Text>
            </Flex>
            {/* Кнопка у нижнего края, чтобы в ряду разной высоты число стояло на одной линии */}
            <Box mt="auto" width="100%">
              {actionButton}
            </Box>
            {quickAddErrorNode}
          </Flex>
        ) : (
          <Flex direction="column" gap="1" className={deedCardStyles.cardContent}>
            <Flex direction="row" justify="between" align="center" gap="3" p="3" pb={quickAddError ? '0' : '3'}>
              <Flex align="center" gap="2" flexGrow="1" minWidth="0" aria-hidden="true">
                {deed.emoji && <Text size="2">{deed.emoji}</Text>}
                <Flex direction="column" gap="1">
                  <Text weight="medium">{deed.name}</Text>
                  {markedToday ? (
                    <Text as="p" size="2" color="gray">
                      <SlotCount value={today} />
                    </Text>
                  ) : null}
                </Flex>
              </Flex>
              {actionButton}
            </Flex>
            {quickAddError ? (
              <Box px="3" pb="3">
                {quickAddErrorNode}
              </Box>
            ) : null}
          </Flex>
        )}
      </Box>
    </Card>
  )
}
