import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Box, Button, Flex, Heading, Text } from '@radix-ui/themes'
import { House } from 'lucide-react'
import { AppBar } from '@/components/AppBar'
import { OnboardingHelpButton } from '@/components/onboarding/OnboardingHelpButton'
import { PageLoading } from '@/components/PageLoading'
import { api } from '@/lib/api'
import { RecordCard } from '@/components/RecordCard'
import type { BlockRow, RecordRow } from '@/types/database'
import { addDaysLocalISO, formatHistoryGroupDate, pluralRecords, todayLocalISO } from '@/lib/format-utils'
import {
  HISTORY_SCROLL_STORAGE_KEY,
  persistHistoryListScrollY,
  persistHistoryLoadedFrom,
  readHistoryLoadedFrom,
} from '@/lib/history-scroll-storage'
import layoutStyles from '@/styles/layout.module.css'

/** Первый экран — последние 7 календарных дней, включая сегодня. */
const HISTORY_INITIAL_DAYS = 7
/** Каждая догрузка — 30 календарных дней, заканчивающихся ближайшей более старой записью. */
const HISTORY_OLDER_CHUNK_DAYS = 30

type HistoryListRow = Awaited<ReturnType<typeof api.deeds.listAllRecordsWithDeedInfo>>[number]

type RecordWithDeed = (RecordRow & { record_answers?: { block_id: string; value_json: unknown }[] }) & {
  deed?: { emoji: string; name: string; blocks?: BlockRow[] }
}

function historyLoadErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : ''
  if (msg.includes('Failed to fetch') || msg.includes('fetch')) {
    return 'Нет связи с сервером. Проверьте интернет и что приложение может обращаться к Supabase.'
  }
  return msg || 'Ошибка загрузки'
}

/** Ответ API списка истории → состояние страницы (сортировка: новые выше). */
function mapListToRecordsWithDeed(records: HistoryListRow[]): RecordWithDeed[] {
  const all: RecordWithDeed[] = records.map((r) => {
    const row = r as { deeds?: { emoji: string; name: string; blocks?: BlockRow[] } | null; deed?: { emoji: string; name: string; blocks?: BlockRow[] } | null }
    const deedInfo = row.deeds ?? row.deed
    return {
      ...r,
      deed: deedInfo ? { emoji: deedInfo.emoji ?? '', name: deedInfo.name ?? '', blocks: deedInfo.blocks ?? [] } : undefined,
    }
  })
  all.sort((a, b) => {
    const d = b.record_date.localeCompare(a.record_date)
    if (d !== 0) return d
    return (b.record_time ?? '').toString().localeCompare((a.record_time ?? '').toString())
  })
  return all
}

function mergeHistoryRecords(current: RecordWithDeed[], incoming: RecordWithDeed[]): RecordWithDeed[] {
  const byId = new Map<string, RecordWithDeed>()
  for (const record of current) byId.set(record.id, record)
  for (const record of incoming) byId.set(record.id, record)
  return Array.from(byId.values()).sort((a, b) => {
    const byDate = b.record_date.localeCompare(a.record_date)
    if (byDate !== 0) return byDate
    return (b.record_time ?? '').toString().localeCompare((a.record_time ?? '').toString())
  })
}

/**
 * Страница истории записей.
 * Сначала последние 7 дней, более ранние — порциями по 30 дней.
 */
export function HistoryPage() {
  // --- Состояние ---
  const [recordsWithDeed, setRecordsWithDeed] = useState<RecordWithDeed[]>([])
  /** Общее число записей для бейджа; null — подсчёт не удался, тогда показываем длину загруженного списка. */
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  /** Нижняя граница уже запрошенного окна (YYYY-MM-DD), не дата самой старой карточки. */
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Одно восстановление скролла за визит (после готовности списка в DOM). */
  const scrollRestoreDoneRef = useRef(false)
  const loadedFromRef = useRef<string | null>(null)
  const loadingMoreRef = useRef(false)
  /** Кнопка была ниже экрана — догрузка только когда её доскроллили, не если она и так видна. */
  const sentinelWasBelowRef = useRef(false)
  /** scrollTo при восстановлении позиции не считается жестом пользователя. */
  const ignoreScrollRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const loadOlderRef = useRef<() => void>(() => {})

  const initialFrom = addDaysLocalISO(todayLocalISO(), 1 - HISTORY_INITIAL_DAYS)

  /**
   * Пока открыта история со списком — постоянно пишем scrollY в sessionStorage.
   * Нельзя полагаться только на cleanup при unmount: при переходе на запись сначала монтируется
   * новая страница и обнуляет скролл окна, и только потом размонтируется история — в cleanup было бы 0.
   */
  useEffect(() => {
    if (loading || error) return
    let ticking = false
    const onScroll = () => {
      const el = sentinelRef.current
      let cameFromBelow = false
      if (el) {
        const rect = el.getBoundingClientRect()
        const inView = rect.top < window.innerHeight && rect.bottom > 0
        cameFromBelow = sentinelWasBelowRef.current && inView
        sentinelWasBelowRef.current = rect.top >= window.innerHeight
      }
      if (!ignoreScrollRef.current && cameFromBelow) loadOlderRef.current()
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        persistHistoryListScrollY()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    persistHistoryListScrollY()
    const el = sentinelRef.current
    sentinelWasBelowRef.current = !!el && el.getBoundingClientRect().top >= window.innerHeight
    return () => window.removeEventListener('scroll', onScroll)
  }, [loading, error, hasMore])

  // После загрузки данных восстанавливаем скролл; до `loading === false` высота списка ещё не финальная.
  useLayoutEffect(() => {
    if (loading || error) return
    if (scrollRestoreDoneRef.current) return
    scrollRestoreDoneRef.current = true
    const raw = sessionStorage.getItem(HISTORY_SCROLL_STORAGE_KEY)
    if (raw == null) return
    const y = Number.parseInt(raw, 10)
    if (!Number.isFinite(y) || y <= 0) return
    ignoreScrollRef.current = true
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo(0, y)
        requestAnimationFrame(() => {
          ignoreScrollRef.current = false
          const el = sentinelRef.current
          sentinelWasBelowRef.current = !!el && el.getBoundingClientRect().top >= window.innerHeight
        })
      })
    })
  }, [loading, error])

  // --- Первая загрузка: 7 дней и, если в этой вкладке уже смотрели хвост, один запрос на него ---
  useEffect(() => {
    let cancelled = false
    const recentFrom = addDaysLocalISO(todayLocalISO(), 1 - HISTORY_INITIAL_DAYS)
    const savedFrom = readHistoryLoadedFrom()
    const windowFrom = savedFrom && savedFrom < recentFrom ? savedFrom : recentFrom

    const recentPromise = api.deeds.listAllRecordsWithDeedInfo({ fromDate: recentFrom })
    const tailPromise =
      windowFrom < recentFrom
        ? api.deeds.listAllRecordsWithDeedInfo({
            fromDate: windowFrom,
            toDate: addDaysLocalISO(recentFrom, -1),
          })
        : Promise.resolve([] as HistoryListRow[])

    Promise.all([
      recentPromise,
      tailPromise,
      api.deeds.oldestRecordDateBefore(windowFrom),
      api.deeds.countAllRecords().catch((e: unknown) => {
        console.error(e instanceof Error ? e.message : e)
        return null
      }),
    ])
      .then(([recent, tail, olderDate, count]) => {
        if (cancelled) return
        setRecordsWithDeed(
          mergeHistoryRecords(mapListToRecordsWithDeed(recent), mapListToRecordsWithDeed(tail)),
        )
        setHasMore(olderDate != null)
        setTotalCount(count)
        loadedFromRef.current = windowFrom
        setLoadedFrom(windowFrom)
        persistHistoryLoadedFrom(windowFrom)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(historyLoadErrorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const refetchHistoryRecords = useCallback(() => {
    const from = loadedFromRef.current
    if (!from) return
    void Promise.all([
      api.deeds.listAllRecordsWithDeedInfo({ fromDate: from }),
      api.deeds.countAllRecords().catch(() => null),
    ])
      .then(([records, count]) => {
        setRecordsWithDeed(mapListToRecordsWithDeed(records))
        if (count != null) setTotalCount(count)
      })
      .catch((e: unknown) => {
        console.error(e instanceof Error ? e.message : e)
      })
  }, [])

  const loadOlder = useCallback(() => {
    if (loadingMoreRef.current) return
    const from = loadedFromRef.current
    if (!from) return
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreError(null)
    void (async () => {
      try {
        const anchor = await api.deeds.oldestRecordDateBefore(from)
        if (!anchor) {
          setHasMore(false)
          return
        }
        // 30 дней, заканчивающихся датой ближайшей более старой записи. Дыра до текущего окна пустая.
        const chunkFrom = addDaysLocalISO(anchor, 1 - HISTORY_OLDER_CHUNK_DAYS)
        const rows = await api.deeds.listAllRecordsWithDeedInfo({ fromDate: chunkFrom, toDate: anchor })
        setRecordsWithDeed((prev) => mergeHistoryRecords(prev, mapListToRecordsWithDeed(rows)))
        loadedFromRef.current = chunkFrom
        setLoadedFrom(chunkFrom)
        persistHistoryLoadedFrom(chunkFrom)
        const nextAnchor = await api.deeds.oldestRecordDateBefore(chunkFrom)
        setHasMore(nextAnchor != null)
      } catch (e: unknown) {
        setLoadMoreError(historyLoadErrorMessage(e))
      } finally {
        loadingMoreRef.current = false
        setLoadingMore(false)
        // После порции кнопка могла остаться на экране — не забирать следующую, пока её снова не доскроллят.
        requestAnimationFrame(() => {
          const el = sentinelRef.current
          sentinelWasBelowRef.current = !!el && el.getBoundingClientRect().top >= window.innerHeight
        })
      }
    })()
  }, [])

  loadOlderRef.current = loadOlder

  // --- Группировка по дате ---
  const byDate = useMemo(() => {
    const map = new Map<string, RecordWithDeed[]>()
    for (const r of recordsWithDeed) {
      const date = r.record_date
      if (!map.has(date)) map.set(date, [])
      map.get(date)!.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [recordsWithDeed])

  const showingOnlyInitialWindow = loadedFrom != null && loadedFrom >= initialFrom
  const badgeCount = totalCount ?? recordsWithDeed.length

  // --- Рендер состояний ---
  if (loading) {
    return <PageLoading title="" titleReserve actionsReserveCount={2} />
  }

  if (error) {
    return (
      <Box p="4">
        <Text color="crimson">{error}</Text>
      </Box>
    )
  }

  const olderControl = hasMore ? (
    <Flex direction="column" gap="2" align="center">
      {loadMoreError ? (
        <Text as="p" size="2" color="crimson" align="center">
          {loadMoreError}
        </Text>
      ) : null}
      <Box ref={sentinelRef}>
        <Button
          type="button"
          size="3"
          color="gray"
          variant="surface"
          disabled={loadingMore}
          onClick={loadOlder}
        >
          {loadingMore ? 'Загрузка…' : 'Показать раньше'}
        </Button>
      </Box>
    </Flex>
  ) : null

  // --- Основной контент ---
  return (
    <Box
      className={layoutStyles.pageContainer}>
      <AppBar
        title="История"
        actions={
          <Flex gap="2" align="center">
            <Badge 
            size="3" 
            color="gray" 
            variant="soft" 
            radius="full">
              {pluralRecords(badgeCount)}
            </Badge>
            <OnboardingHelpButton flowId="help_history" />
          </Flex>
        }
      />

      {recordsWithDeed.length === 0 && !hasMore ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          flexGrow="1"
          gap="5"
          width="100%"
          style={{ minHeight: 'calc(100dvh - 10rem)' }}
        >
          <Flex direction="column" align="center" gap="2">
            <Heading as="h2" size="5" weight="medium" align="center">
              Пока нет записей
            </Heading>
            <Text size="2" color="gray" align="center">
              Для появления записей добавь первую в&nbsp;любом деле
            </Text>
          </Flex>
          <Button 
          size="3" 
          variant="classic"
          radius="full"
          aria-label="Перейти к списку дел"
          asChild>
            <Link to="/">
              <House size={16} />
              Перейти к делам
            </Link>
          </Button>
        </Flex>
      ) : (
        <Flex direction="column" gap="5">
          {recordsWithDeed.length === 0 ? (
            <Text as="p" size="3" color="gray">
              {showingOnlyInitialWindow
                ? 'За последние 7 дней записей нет'
                : 'В загруженном периоде записей нет'}
            </Text>
          ) : (
            byDate.map(([date, records], index) => {
              const recordYear = Number.parseInt(date.slice(0, 4), 10)
              const currentYear = new Date().getFullYear()
              const prevDateStr = index > 0 ? byDate[index - 1]![0] : null
              const prevYear = prevDateStr != null ? Number.parseInt(prevDateStr.slice(0, 4), 10) : null
              // Для любого года, кроме текущего, перед первой датой этого года показываем строку с годом (например «2025», затем «31 декабря 2025»).
              const showYearHeading = recordYear !== currentYear && prevYear !== recordYear

              return (
              <Box key={date}>
                {showYearHeading ? (
                  <Text as="p" size="9">
                    {recordYear}
                  </Text>
                ) : null}
                <Flex direction="column" gap="2">
                  <Flex justify="between" align="center" gap="8">
                    <Text as="p" size="3" color="gray">
                      {formatHistoryGroupDate(date)}
                    </Text>
                    <Badge
                    size="2" 
                    color="gray" 
                    variant="soft"
                    radius="full"
                    >
                      {records.length}
                    </Badge>
                  </Flex>
                  {records.map((rec) => (
                    <RecordCard
                    key={rec.id}
                    record={rec}
                    blocks={rec.deed?.blocks ?? []}
                    deedPrefix={rec.deed ? { emoji: rec.deed.emoji, name: rec.deed.name } : undefined}
                    linkState={{ from: 'history' }}
                    previewGray
                    onRecordDeleted={refetchHistoryRecords}
                    />
                  ))}
                </Flex>
              </Box>
              )
            })
          )}
          {olderControl}
        </Flex>
      )}
    </Box>
  )
}
