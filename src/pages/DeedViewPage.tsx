import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { AlertDialog, Box, Button, Card, DropdownMenu, Flex, Heading, IconButton, Separator, Text } from '@radix-ui/themes'
import { DeedActivityHeatmap } from '@/components/DeedActivityHeatmap'
import { DeedDescriptionText } from '@/components/DeedDescriptionText'
import { AppBar } from '@/components/AppBar'
import { useOnboarding } from '@/lib/onboarding-context'
import { PageLoading } from '@/components/PageLoading'
import { CheckIcon, DotsHorizontalIcon, PlusIcon, Pencil1Icon, TrashIcon, QuestionMarkCircledIcon, UpdateIcon } from '@radix-ui/react-icons'
import { api } from '@/lib/api'
import { RecordCard } from '@/components/RecordCard'
import type { DeedWithBlocks } from '@/types/database'
import layoutStyles from '@/styles/layout.module.css'
import styles from './DeedViewPage.module.css'
import { formatDate, nowTimeLocal, pluralRecords, todayLocalISO } from '@/lib/format-utils'
import { triggerHaptic } from '@/lib/haptics'
import { deedQuickAddFromDefaultsActive, getQuickAddRecordAnswers, QUICK_ADD_FROM_DEFAULTS_LONG_PRESS_MS } from '@/lib/deed-quick-add'
import { getDeedDisplayNumbers, type RecordWithAnswersLoose } from '@/lib/deed-utils'
import { currentStreak, maxStreak, workdayWeekendCounts } from '@/lib/deed-analytics'
import {
  heatmapDisplayColor,
  normalizeDeedAnalyticsConfig,
  resolveNumericBlockByConfigId,
  getRecordAnswerNumericValue,
} from '@/lib/deed-analytics-config'

/**
 * Страница просмотра дела.
 * Показывает заголовок, описание, аналитику (стрики, рабочие/выходные дни) и историю записей по датам.
 */
export function DeedViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { openFlow } = useOnboarding()

  // --- Состояние ---
  const [deed, setDeed] = useState<DeedWithBlocks | null>(null)
  const [records, setRecords] = useState<RecordWithAnswersLoose[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** UI-диалог вместо `window.confirm` — во встроенном браузере Cursor нативные диалоги могут не показываться. */
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  /** Создание записи одним тапом «+» при включённом быстром добавлении из дефолтов. */
  const [addingRecord, setAddingRecord] = useState(false)
  const [quickAddSuccess, setQuickAddSuccess] = useState(false)
  /** Ошибка быстрого добавления — не смешиваем с `error` загрузки, чтобы не терять экран дела. */
  const [quickAddError, setQuickAddError] = useState<string | null>(null)
  const successHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  // --- Загрузка дела и записей ---
  useEffect(() => {
    if (!id) return
    let cancelled = false
    Promise.all([api.deeds.get(id), api.deeds.records(id)])
      .then(([deedData, recordsData]) => {
        if (!cancelled) {
          setDeed(deedData ?? null)
          setRecords(recordsData)
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? 'Ошибка загрузки')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [id])

  // --- Удаление дела (подтверждение через AlertDialog) ---
  async function confirmDeleteDeed() {
    if (!id) return
    setDeleteLoading(true)
    try {
      await api.deeds.delete(id)
      setDeleteOpen(false)
      navigate('/')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось удалить дело'
      setError(msg)
      setDeleteOpen(false)
    } finally {
      setDeleteLoading(false)
    }
  }

  // --- Вычисляемые данные ---
  // Записи сгруппированы по дате, сортировка: новые сверху
  const byDate = useMemo(() => {
    const sorted = [...records].sort((a, b) => {
      const d = b.record_date.localeCompare(a.record_date)
      if (d !== 0) return d
      return (b.record_time ?? '').toString().localeCompare((a.record_time ?? '').toString())
    })
    const map = new Map<string, typeof records>()
    for (const r of sorted) {
      const date = r.record_date
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [records])

  const analyticsConfig = useMemo(
    () => normalizeDeedAnalyticsConfig(deed?.analytics_config),
    [deed?.analytics_config],
  )

  // Аналитика: стрики и распределение по рабочим/выходным (только если есть записи)
  const analytics = useMemo(() => {
    if (records.length === 0) return null
    return {
      currentStreak: currentStreak(records),
      maxStreak: maxStreak(records),
      workdayWeekend: workdayWeekendCounts(records),
    }
  }, [records])

  const summaryBlock = useMemo(() => {
    const blocks = deed?.blocks ?? []
    return resolveNumericBlockByConfigId(blocks, analyticsConfig.summary.block_id)
  }, [deed?.blocks, analyticsConfig.summary.block_id])

  const heatmapBlock = useMemo(() => {
    const blocks = deed?.blocks ?? []
    return resolveNumericBlockByConfigId(blocks, analyticsConfig.heatmap.block_id)
  }, [deed?.blocks, analyticsConfig.heatmap.block_id])

  // Heatmap: по умолчанию — число записей в день; иначе сумма значений выбранного числового блока по дням.
  const heatmapActivity = useMemo(() => {
    if (!heatmapBlock) {
      return records.map((r) => ({ record_date: r.record_date, value: 1 }))
    }
    return records.map((r) => ({
      record_date: r.record_date,
      value: getRecordAnswerNumericValue(r, heatmapBlock),
    }))
  }, [records, heatmapBlock])

  // Количества «сегодня / этот месяц / всего»: при числовом источнике в сводке — сумма по блоку; иначе те же правила, что на карточке в списке (число записей).
  const displayNumbers = useMemo(() => {
    if (!summaryBlock) {
      return getDeedDisplayNumbers(deed?.blocks ?? [], records)
    }

    const todayISO = todayLocalISO()
    const getRecordValue = (r: (typeof records)[number]): number =>
      getRecordAnswerNumericValue(r, summaryBlock)

    const total = records.reduce((sum, r) => sum + getRecordValue(r), 0)

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()

    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const monthEndDate = new Date(year, month + 1, 0).getDate()
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(monthEndDate).padStart(2, '0')}`

    const today = records.filter((r) => r.record_date === todayISO).reduce((sum, r) => sum + getRecordValue(r), 0)
    const monthTotal = records
      .filter((r) => r.record_date >= monthStart && r.record_date <= monthEnd)
      .reduce((sum, r) => sum + getRecordValue(r), 0)

    return { today, month: monthTotal, total }
  }, [summaryBlock, records, deed?.blocks])

  const heatmapCardColor = heatmapDisplayColor(
    deed?.card_color,
    analyticsConfig.heatmap.enabled,
  )
  const s = analyticsConfig.summary
  const showSummaryRow =
    s.enabled &&
    (s.show_today || s.show_month || s.show_total)
  const showActivityRow =
    records.length > 0 &&
    analyticsConfig.activity.enabled &&
    (analyticsConfig.activity.streak_enabled ||
      analyticsConfig.activity.record_count_enabled)
  const showHeatmap = analyticsConfig.heatmap.enabled
  const showAnalyticsBlock =
    showSummaryRow || showActivityRow || showHeatmap

  const quickAddFromDefaults = useMemo(
    () => (deed ? deedQuickAddFromDefaultsActive(deed) : false),
    [deed],
  )

  async function handleQuickAddFromDefaultsRecord() {
    if (!id || !deed || addingRecord || quickAddSuccess) return
    const answers = getQuickAddRecordAnswers(deed)
    if (!answers) return
    setAddingRecord(true)
    setQuickAddError(null)
    try {
      await api.deeds.createRecord(id, {
        record_date: todayLocalISO(),
        record_time: nowTimeLocal(),
        answers,
      })
      const recordsData = await api.deeds.records(id)
      setRecords(recordsData)
      triggerHaptic('success', { intensity: 1 })
      if (successHideTimeoutRef.current) clearTimeout(successHideTimeoutRef.current)
      setQuickAddSuccess(true)
      successHideTimeoutRef.current = setTimeout(() => {
        setQuickAddSuccess(false)
        successHideTimeoutRef.current = null
      }, 1000)
    } catch (e) {
      setQuickAddError(e instanceof Error ? e.message : 'Не удалось добавить запись')
    } finally {
      setAddingRecord(false)
    }
  }

  /** Удержание — через паузу открываем форму (и без быстрого добавления), без ожидания отпускания. */
  function handlePlusPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (!id || (quickAddFromDefaults && (addingRecord || quickAddSuccess))) return
    longPressConsumedClickRef.current = false
    clearLongPressTimer()
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      longPressConsumedClickRef.current = true
      navigate(`/deeds/${id}/fill`)
      triggerHaptic('medium', { intensity: 0.45 })
    }, QUICK_ADD_FROM_DEFAULTS_LONG_PRESS_MS)
  }

  function handlePlusPointerEnd() {
    clearLongPressTimer()
  }

  function handlePlusClick(e: React.MouseEvent) {
    e.preventDefault()
    if (longPressConsumedClickRef.current) {
      longPressConsumedClickRef.current = false
      return
    }
    if (quickAddFromDefaults) {
      void handleQuickAddFromDefaultsRecord()
    } else if (id) {
      navigate(`/deeds/${id}/fill`)
    }
  }

  // --- Рендер состояний загрузки и ошибки ---
  if (loading) {
    return <PageLoading backHref="/" title="" actionsReserveCount={3} />
  }

  if (error || !deed) {
    return (
      <Flex direction="column" gap="2" p="4">
        <AppBar backHref="/" />
        <Text as="p" size="2" color="crimson">
          {error ?? 'Дело не найдено'}
        </Text>
      </Flex>
    )
  }

  // --- Основной контент ---
  return (
    <Box className={layoutStyles.pageContainer}>
      <AppBar
        backHref="/"
        title=""
        actions={
          <Flex gap="2" align="center">
            {quickAddFromDefaults && quickAddSuccess ? (
              <IconButton
                type="button"
                size="3"
                color="green"
                variant="solid"
                radius="full"
                title="Запись добавлена"
                aria-label="Запись добавлена"
                onClick={(e) => e.preventDefault()}
              >
                <CheckIcon />
              </IconButton>
            ) : quickAddFromDefaults && addingRecord ? (
              <IconButton
                type="button"
                size="3"
                variant="soft"
                radius="full"
                aria-label="Добавление записи"
                disabled
              >
                <UpdateIcon />
              </IconButton>
            ) : (
              <IconButton
                type="button"
                size="3"
                variant="classic"
                radius="full"
                title={
                  quickAddFromDefaults
                    ? 'Нажать — запись с дефолтами. Удерживать — форма с датой и временем'
                    : 'Нажать — форма записи. Удерживать — та же форма после короткой паузы'
                }
                aria-label={addingRecord ? 'Добавление…' : 'Добавить запись'}
                onPointerDown={handlePlusPointerDown}
                onPointerUp={handlePlusPointerEnd}
                onPointerCancel={handlePlusPointerEnd}
                onPointerLeave={handlePlusPointerEnd}
                onClick={handlePlusClick}
              >
                <PlusIcon />
              </IconButton>
            )}
            <Separator orientation="vertical" />
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButton
                  type="button"
                  size="3"
                  color="gray"
                  variant="classic"
                  radius="full"
                  aria-label="Действия с делом"
                >
                  <DotsHorizontalIcon />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content variant="solid" size="2" align="end" sideOffset={8}>
                <DropdownMenu.Item asChild>
                  <Link to={`/deeds/${id}/edit`}> <Pencil1Icon /> Редактировать</Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item color="red" onSelect={() => setDeleteOpen(true)}>
                  <TrashIcon /> Удалить
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item color="gray" onSelect={() => openFlow('help_deed_view')}>
                  <QuestionMarkCircledIcon /> Справка
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </Flex>
        }
      />
    <Flex direction="column" gap="4">
      {quickAddError ? (
        <Text as="p" size="2" color="crimson" role="alert">
          {quickAddError}
        </Text>
      ) : null}

      <Flex direction="column">
        <Heading as="h1" size="7">
          {`${deed.name}`}
        </Heading>

        {deed.description ? (
          <DeedDescriptionText text={deed.description} />
        ) : null}
      </Flex>

      {showAnalyticsBlock ? (
        <Box className={styles.analyticsSection}>
          {showSummaryRow ? (
            <Flex direction="row" gap="2" wrap="wrap" mb="2">
              {s.show_today ? (
                <Card style={{ flex: '1' }}>
                  <Flex direction="column" gap="1">
                    <Text size="2" color="gray">Сегодня</Text>
                    <Text size="4">
                      {displayNumbers.today}
                    </Text>
                  </Flex>
                </Card>
              ) : null}

              {s.show_month ? (
                <Card style={{ flex: '1' }}>
                  <Flex direction="column" gap="1">
                    <Text size="2" color="gray">За месяц</Text>
                    <Text size="4">
                      {displayNumbers.month}
                    </Text>
                  </Flex>
                </Card>
              ) : null}

              {s.show_total ? (
                <Card style={{ flex: '1' }}>
                  <Flex direction="column" gap="1">
                    <Text size="2" color="gray">Всего</Text>
                    <Text size="4">
                      {displayNumbers.total}
                    </Text>
                  </Flex>
                </Card>
              ) : null}
            </Flex>
          ) : null}

          {analytics && showActivityRow ? (
            <Flex direction="row" gap="2" wrap="wrap" mb="2">
              {analyticsConfig.activity.streak_enabled ? (
                <Card style={{ flex: '1' }}>
                  <Flex
                    direction="column"
                    gap="1"
                    mb={analyticsConfig.activity.max_streak_enabled ? '2' : '0'}
                  >
                    <Text size="2" color="gray">Текущий стрик</Text>
                    <Text size="4">{analytics.currentStreak}</Text>
                  </Flex>

                  {analyticsConfig.activity.max_streak_enabled ? (
                    <Flex direction="row" gap="1">
                      <Text size="2" color="gray">Максимум:</Text>
                      <Text size="2">{analytics.maxStreak}</Text>
                    </Flex>
                  ) : null}
                </Card>
              ) : null}

              {analyticsConfig.activity.record_count_enabled ? (
                <Card style={{ flex: '1' }}>
                  <Flex direction="column" gap="1" mb={analyticsConfig.activity.workday_weekend_enabled ? '2' : '0'}>
                    <Text size="2" color="gray">Всего</Text>
                    <Text size="4">{pluralRecords(records.length)}</Text>
                  </Flex>

                  {analyticsConfig.activity.workday_weekend_enabled ? (
                    <Flex direction="row" gap="2">
                      <Flex direction="row" gap="1">
                        <Text size="2" color="gray">Будни:</Text>
                        <Text size="2">{analytics.workdayWeekend.workday}</Text>
                      </Flex>
                      <Text size="2" color="gray">·</Text>
                      <Flex direction="row" gap="1">
                        <Text size="2" color="gray">Выходные:</Text>
                        <Text size="2">{analytics.workdayWeekend.weekend}</Text>
                      </Flex>
                    </Flex>
                  ) : null}
                </Card>
              ) : null}
            </Flex>
          ) : null}

          {showHeatmap ? (
            <Flex direction="row" gap="2">
              <DeedActivityHeatmap
                activity={heatmapActivity}
                valueLabel={heatmapBlock?.title}
                cardColor={heatmapCardColor}
                showWeekdayLabels={analyticsConfig.heatmap.show_weekday_labels}
                showMonthLabels={analyticsConfig.heatmap.show_month_labels}
                showPeakAndLegend={analyticsConfig.heatmap.show_peak_and_legend}
              />
            </Flex>
          ) : null}
        </Box>
      ) : null}

      {/* История записей по датам */}
      {/* <Heading as="h3" size="4">
        История
      </Heading> */}

      {records.length === 0 ? (
        <Text as="p" size="2" color="gray">
          Пока нет записей. Добавьте первую.
        </Text>
      ) : (
        <Flex direction="column" gap="4">
          {byDate.map(([date, dayRecords]) => (
            <Flex key={date} direction="column" gap="2">
              <Text as="p" size="3" color="gray">
                {formatDate(date)}
              </Text>
              <Flex direction="column" gap="2">
                {dayRecords.map((rec) => (
                  <RecordCard
                    key={rec.id}
                    record={rec}
                    blocks={deed.blocks ?? []}
                    hideAvatar
                    onRecordDeleted={() => {
                      if (!id) return
                      void api.deeds.records(id).then(setRecords)
                    }}
                  />
                ))}
              </Flex>
            </Flex>
          ))}
        </Flex>
      )}
      </Flex>

      <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialog.Content maxWidth="450px">
          <AlertDialog.Title>Удалить дело?</AlertDialog.Title>
          <AlertDialog.Description size="2">
            Все записи по этому делу также будут удалены. Это действие нельзя отменить
          </AlertDialog.Description>
          <Flex gap="3" justify="end" mt="4">
            <AlertDialog.Cancel>
              <Button 
              type="button" 
              size="3" 
              color="gray" 
              variant="soft">
                Отмена
              </Button>
            </AlertDialog.Cancel>
            <Button
              type="button"
              size="3"
              color="red"
              variant="classic"
              disabled={deleteLoading}
              onClick={() => void confirmDeleteDeed()}
            >
              {deleteLoading ? 'Удаляю…' : 'Удалить'}
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Box>
  )
}
