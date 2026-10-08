import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Box, Button, Card, Flex, IconButton, Skeleton, Text } from '@radix-ui/themes'
import { CheckIcon, PlusIcon, UpdateIcon } from '@radix-ui/react-icons'
import type { DeedWithBlocks } from '@/types/database'
import type { RecordRow, RecordAnswerRow } from '@/types/database'
import { getDeedDisplayNumbers } from '@/lib/deed-utils'
import { deedQuickAddFromDefaultsActive, getQuickAddRecordAnswers, QUICK_ADD_FROM_DEFAULTS_LONG_PRESS_MS } from '@/lib/deed-quick-add'
import { api } from '@/lib/api'
import { nowTimeLocal, todayLocalISO } from '@/lib/format-utils'
import { triggerHaptic } from '@/lib/haptics'
import { useDelayedActionLoader } from '@/lib/use-delayed-action-loader'
import deedCardStyles from '@/components/DeedCard.module.css'

/** row — строка списка; stack — плитка в сетке (эмодзи и название, счётчики, «+» на всю ширину). */
export type DeedCardLayout = 'row' | 'stack'

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
 * Кнопка «+» — добавление записи (pointer-events только на кнопке).
 */
export function DeedCard({
  deed,
  records,
  countersLoading = false,
  onRecordsRefresh,
  layout = 'row',
}: DeedCardProps) {
  const navigate = useNavigate()
  const { today, total } = getDeedDisplayNumbers(deed.blocks ?? [], records)
  const { spinnerVisible, run: runQuickAddWithDelayedSpinner } = useDelayedActionLoader()

  const quickAddActive = useMemo(() => deedQuickAddFromDefaultsActive(deed), [deed])

  /** Быстрый «+»: лоадер с задержкой и минимальной длительностью — см. useDelayedActionLoader. */
  const [actionPending, setActionPending] = useState(false)
  const [quickAddSuccess, setQuickAddSuccess] = useState(false)
  const [quickAddError, setQuickAddError] = useState<string | null>(null)
  const successHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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
      if (successHideTimeoutRef.current) clearTimeout(successHideTimeoutRef.current)
      clearLongPressTimer()
    }
  }, [])

  async function handleQuickAddFromDefaults(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const answers = getQuickAddRecordAnswers(deed)
    if (!answers || actionPending || quickAddSuccess) return
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
      if (successHideTimeoutRef.current) clearTimeout(successHideTimeoutRef.current)
      setQuickAddSuccess(true)
      successHideTimeoutRef.current = setTimeout(() => {
        setQuickAddSuccess(false)
        successHideTimeoutRef.current = null
      }, 1000)
    } catch (err) {
      setQuickAddError(err instanceof Error ? err.message : 'Не удалось добавить запись')
    } finally {
      setActionPending(false)
    }
  }

  /** Удержание — через фиксированную паузу открываем форму (без ожидания отпускания), короткий тап — см. handlePlusClick. */
  function handlePlusPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (quickAddActive && (actionPending || quickAddSuccess)) return
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

  const deedOpenLabel = countersLoading
    ? `Открыть дело «${deed.name}»${deed.category ? `. ${deed.category}` : ''}. Статистика загружается`
    : `Открыть дело «${deed.name}»${deed.category ? `. ${deed.category}` : ''}. ${today} сегодня, ${total} всего`

  const showSuccess = quickAddActive && quickAddSuccess
  const showSpinner = quickAddActive && actionPending && spinnerVisible
  const actionIdle = !showSuccess && !(quickAddActive && actionPending)

  const actionLabel = showSuccess
    ? 'Запись добавлена'
    : quickAddActive && actionPending
      ? 'Добавление записи'
      : 'Добавить запись'

  const actionTitle = actionIdle
    ? quickAddActive
      ? 'Нажать — запись с дефолтами. Удерживать — форма с датой и временем'
      : 'Нажать — форма записи. Удерживать — та же форма после короткой паузы'
    : showSuccess
      ? 'Запись добавлена'
      : 'Добавление записи…'

  const actionIcon = showSuccess ? (
    <CheckIcon />
  ) : showSpinner ? (
    <UpdateIcon className={deedCardStyles.iconSpin} />
  ) : (
    <PlusIcon />
  )

  /** Одни и те же состояния «+»; в сетке кнопка на всю ширину, в списке — IconButton. */
  const actionButton = layout === 'stack' ? (
    <Button
      type="button"
      size="3"
      variant="soft"
      radius="full"
      color={showSuccess ? 'green' : undefined}
      className={`${deedCardStyles.cardActionButton} ${deedCardStyles.pillActionButton}`}
      title={actionTitle}
      aria-label={actionLabel}
      disabled={!actionIdle && !showSuccess}
      onPointerDown={actionIdle ? handlePlusPointerDown : undefined}
      onPointerUp={actionIdle ? handlePlusPointerEnd : undefined}
      onPointerCancel={actionIdle ? handlePlusPointerEnd : undefined}
      onPointerLeave={actionIdle ? handlePlusPointerEnd : undefined}
      onClick={
        actionIdle
          ? handlePlusClick
          : (e) => {
              e.preventDefault()
              e.stopPropagation()
            }
      }
    >
      {actionIcon}
    </Button>
  ) : (
    <IconButton
      type="button"
      size="4"
      variant="soft"
      color={showSuccess ? 'green' : undefined}
      className={deedCardStyles.cardActionButton}
      title={actionTitle}
      aria-label={actionLabel}
      disabled={!actionIdle && !showSuccess}
      onPointerDown={actionIdle ? handlePlusPointerDown : undefined}
      onPointerUp={actionIdle ? handlePlusPointerEnd : undefined}
      onPointerCancel={actionIdle ? handlePlusPointerEnd : undefined}
      onPointerLeave={actionIdle ? handlePlusPointerEnd : undefined}
      onClick={
        actionIdle
          ? handlePlusClick
          : (e) => {
              e.preventDefault()
              e.stopPropagation()
            }
      }
    >
      {actionIcon}
    </IconButton>
  )

  const counters = (
    <Text as="p" size="2" color="gray">
      {countersLoading ? (
        <>
          <Skeleton loading width="1rem" height="1em" style={{ display: 'inline-block', verticalAlign: 'text-bottom' }}>
            <Text as="span" size="2">{today}</Text>
          </Skeleton>
          {' '}сегодня ·{' '}
          <Skeleton loading width="1rem" height="1em" style={{ display: 'inline-block', verticalAlign: 'text-bottom' }}>
            <Text as="span" size="2">{total}</Text>
          </Skeleton>
          {' '}всего
        </>
      ) : (
        `${today} сегодня · ${total} всего`
      )}
    </Text>
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
            <Box aria-hidden="true">{counters}</Box>
            {/* Кнопка у нижнего края, чтобы в ряду разной высоты «+» стояли на одной линии */}
            <Box mt="auto" width="100%">
              {actionButton}
            </Box>
            {quickAddErrorNode}
          </Flex>
        ) : (
          <Flex direction="column" gap="1" className={deedCardStyles.cardContent}>
            <Flex direction="row" justify="between" align="center" gap="3" p="3" pb={quickAddError ? '0' : '3'}>
              <Flex align="start" gap="2" flexGrow="1" minWidth="0" aria-hidden="true">
                {deed.emoji && <Text size="2">{deed.emoji}</Text>}
                <Flex direction="column" gap="1">
                  <Text weight="medium">{deed.name}</Text>
                  {counters}
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
