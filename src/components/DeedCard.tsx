import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Box, Card, Flex, IconButton, Skeleton, Text } from '@radix-ui/themes'
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

type DeedCardProps = {
  deed: DeedWithBlocks
  records: (RecordRow & { record_answers?: RecordAnswerRow[] })[]
  /** Второй запрос на главной ещё не вернул записи — не показываем ложные нули в счётчиках. */
  countersLoading?: boolean
  /** После успешного быстрого «+» — обновить счётчики на карточке. */
  onRecordsRefresh?: (deedId: string) => void | Promise<void>
}

/**
 * Карточка дела в списке.
 * Клик по карточке — просмотр дела (полноразмерная ссылка под контентом).
 * Кнопка «+» — добавление записи (pointer-events только на кнопке).
 */
export function DeedCard({ deed, records, countersLoading = false, onRecordsRefresh }: DeedCardProps) {
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

  return (
    <Card className={`${deedCardStyles.cardNoPadding} ${deedCardStyles.cardInteractive}`}>
      <Box position="relative">
        {/* Вся карточка — переход к делу; клики проходят сквозь .cardContent и попадают сюда */}
        <Link
          to={`/deeds/${deed.id}`}
          className={deedCardStyles.cardHitArea}
          aria-label={deedOpenLabel}
        />
        <Flex direction="column" gap="1" className={deedCardStyles.cardContent}>
          <Flex direction="row" justify="between" align="center" gap="3" p="3" pb={quickAddError ? '0' : '3'}>
            <Flex align="start" gap="2" flexGrow="1" minWidth="0" aria-hidden="true">
              {deed.emoji && <Text size="2">{deed.emoji}</Text>}
              <Flex direction="column" gap="1">
                <Flex align="center" gapX="2" gapY="1" wrap="wrap">
                  <Text weight="medium">{deed.name}</Text>
                </Flex>
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
              </Flex>
            </Flex>

            {quickAddActive && quickAddSuccess ? (
              <IconButton
                type="button"
                size="3"
                color="green"
                variant="solid"
                radius="full"
                className={deedCardStyles.cardActionButton}
                title="Запись добавлена"
                aria-label="Запись добавлена"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
              >
                <CheckIcon />
              </IconButton>
            ) : quickAddActive && actionPending && spinnerVisible ? (
              <IconButton
                type="button"
                size="3"
                variant="soft"
                radius="full"
                className={deedCardStyles.cardActionButton}
                title="Добавление записи…"
                aria-label="Добавление записи"
                disabled
              >
                <UpdateIcon className={deedCardStyles.iconSpin} />
              </IconButton>
            ) : quickAddActive && actionPending ? (
              <IconButton
                type="button"
                size="3"
                variant="classic"
                radius="full"
                className={deedCardStyles.cardActionButton}
                title="Добавление записи…"
                aria-label="Добавление записи"
                disabled
              >
                <PlusIcon />
              </IconButton>
            ) : (
              <IconButton
                type="button"
                size="3"
                variant="classic"
                radius="full"
                className={deedCardStyles.cardActionButton}
                title={
                  quickAddActive
                    ? 'Нажать — запись с дефолтами. Удерживать — форма с датой и временем'
                    : 'Нажать — форма записи. Удерживать — та же форма после короткой паузы'
                }
                aria-label="Добавить запись"
                onPointerDown={handlePlusPointerDown}
                onPointerUp={handlePlusPointerEnd}
                onPointerCancel={handlePlusPointerEnd}
                onPointerLeave={handlePlusPointerEnd}
                onClick={handlePlusClick}
              >
                <PlusIcon />
              </IconButton>
            )}
          </Flex>
          {quickAddError ? (
            <Box px="3" pb="3">
              <Text size="1" color="crimson" role="alert">
                {quickAddError}
              </Text>
            </Box>
          ) : null}
        </Flex>
      </Box>
    </Card>
  )
}
