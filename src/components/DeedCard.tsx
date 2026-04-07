import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Box, Card, Flex, IconButton, Text } from '@radix-ui/themes'
import { CheckIcon, PlusIcon, UpdateIcon } from '@radix-ui/react-icons'
import type { DeedWithBlocks } from '@/types/database'
import type { RecordRow, RecordAnswerRow } from '@/types/database'
import { getDeedDisplayNumbers, getSingleYesNoBlock } from '@/lib/deed-utils'
import { api } from '@/lib/api'
import { nowTimeLocal, todayLocalISO } from '@/lib/format-utils'
import { triggerHaptic } from '@/lib/haptics'
import deedCardStyles from '@/components/DeedCard.module.css'

type DeedCardProps = {
  deed: DeedWithBlocks
  records: (RecordRow & { record_answers?: RecordAnswerRow[] })[]
  /** После успешного быстрого «+» для одного блока «Да/Нет» — обновить счётчики на карточке. */
  onRecordsRefresh?: (deedId: string) => void | Promise<void>
}

/** Удержание «+» на карточке с одним «Да/Нет» — открыть форму заполнения (короткое нажатие = быстрая запись). */
const YES_NO_LONG_PRESS_MS = 500

/**
 * Карточка дела в списке.
 * Клик по карточке — просмотр дела (полноразмерная ссылка под контентом).
 * Кнопка «+» — добавление записи (pointer-events только на кнопке).
 */
export function DeedCard({ deed, records, onRecordsRefresh }: DeedCardProps) {
  const navigate = useNavigate()
  const { today, total } = getDeedDisplayNumbers(deed.blocks ?? [], records)

  const singleYesNoBlock = useMemo(
    () => getSingleYesNoBlock(deed.blocks),
    [deed.blocks],
  )

  const [addingRecord, setAddingRecord] = useState(false)
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

  async function handleQuickAddYesNo(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!singleYesNoBlock || addingRecord || quickAddSuccess) return
    setAddingRecord(true)
    setQuickAddError(null)
    try {
      await api.deeds.createRecord(deed.id, {
        record_date: todayLocalISO(),
        record_time: nowTimeLocal(),
        answers: { [singleYesNoBlock.id]: { yesNo: true } },
      })
      await onRecordsRefresh?.(deed.id)
      triggerHaptic('success', { intensity: 1 })
      // Краткая зелёная галочка вместо «+» — явный success после обновления счётчиков
      if (successHideTimeoutRef.current) clearTimeout(successHideTimeoutRef.current)
      setQuickAddSuccess(true)
      successHideTimeoutRef.current = setTimeout(() => {
        setQuickAddSuccess(false)
        successHideTimeoutRef.current = null
      }, 1000)
    } catch (err) {
      setQuickAddError(err instanceof Error ? err.message : 'Не удалось добавить запись')
    } finally {
      setAddingRecord(false)
    }
  }

  function handleYesNoPlusPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (addingRecord || quickAddSuccess) return
    longPressConsumedClickRef.current = false
    clearLongPressTimer()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      longPressConsumedClickRef.current = true
      navigate(`/deeds/${deed.id}/fill`)
      triggerHaptic('medium', { intensity: 0.45 })
    }, YES_NO_LONG_PRESS_MS)
  }

  function handleYesNoPlusPointerEnd() {
    clearLongPressTimer()
  }

  function handleYesNoPlusClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (longPressConsumedClickRef.current) {
      longPressConsumedClickRef.current = false
      return
    }
    void handleQuickAddYesNo(e)
  }

  const deedOpenLabel = `Открыть дело «${deed.name}»${deed.category ? `. ${deed.category}` : ''}. ${today} сегодня, ${total} всего`

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
                  {deed.category && (
                    <Badge size="1" color="gray" radius="large" variant="surface">
                      {deed.category}
                    </Badge>
                  )}
                </Flex>
                <Text as="p" size="2" color="gray">
                  {today} сегодня · {total} всего
                </Text>
              </Flex>
            </Flex>

            {singleYesNoBlock ? (
              quickAddSuccess ? (
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
              ) : addingRecord ? (
                <IconButton
                  type="button"
                  size="3"
                  color="gray"
                  variant="surface"
                  radius="large"
                  className={deedCardStyles.cardActionButton}
                  title="Добавление записи…"
                  aria-label="Добавление записи"
                  disabled
                >
                  <UpdateIcon className={deedCardStyles.iconSpin} />
                </IconButton>
              ) : (
                <IconButton
                  type="button"
                  size="3"
                  variant="surface"
                  radius="large"
                  className={deedCardStyles.cardActionButton}
                  title="Нажать — быстрая запись «Да». Удерживать — форма с датой и временем"
                  aria-label="Добавить запись"
                  onPointerDown={handleYesNoPlusPointerDown}
                  onPointerUp={handleYesNoPlusPointerEnd}
                  onPointerCancel={handleYesNoPlusPointerEnd}
                  onPointerLeave={handleYesNoPlusPointerEnd}
                  onClick={handleYesNoPlusClick}
                >
                  <PlusIcon />
                </IconButton>
              )
            ) : (
              <IconButton
                size="3"
                variant="surface"
                radius="large"
                asChild
                title="Добавить запись"
                aria-label="Добавить запись"
              >
                <Link
                  to={`/deeds/${deed.id}/fill`}
                  className={deedCardStyles.cardActionButton}
                  onClick={(e) => e.stopPropagation()}
                >
                  <PlusIcon />
                </Link>
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
