import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Box, Button, Flex, Heading, Text } from '@radix-ui/themes'
import { HomeIcon } from '@radix-ui/react-icons'
import { AppBar } from '@/components/AppBar'
import { PageLoading } from '@/components/PageLoading'
import { api } from '@/lib/api'
import { RecordCard } from '@/components/RecordCard'
import type { BlockRow, RecordRow } from '@/types/database'
import { formatDate, pluralRecords } from '@/lib/format-utils'
import { HISTORY_SCROLL_STORAGE_KEY, persistHistoryListScrollY } from '@/lib/history-scroll-storage'
import layoutStyles from '@/styles/layout.module.css'

type RecordWithDeed = (RecordRow & { record_answers?: { block_id: string; value_json: unknown }[] }) & {
  deed?: { emoji: string; name: string; blocks?: BlockRow[] }
}

/**
 * Страница истории записей.
 * Показывает все записи пользователя, сгруппированные по дате, с превью ответов.
 */
export function HistoryPage() {
  // --- Состояние ---
  const [recordsWithDeed, setRecordsWithDeed] = useState<RecordWithDeed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /** Одно восстановление скролла за визит (после готовности списка в DOM). */
  const scrollRestoreDoneRef = useRef(false)

  /**
   * Пока открыта история со списком — постоянно пишем scrollY в sessionStorage.
   * Нельзя полагаться только на cleanup при unmount: при переходе на запись сначала монтируется
   * новая страница и обнуляет скролл окна, и только потом размонтируется история — в cleanup было бы 0.
   */
  useEffect(() => {
    if (loading || error) return
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        ticking = false
        persistHistoryListScrollY()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [loading, error])

  // После загрузки данных восстанавливаем скролл; до `loading === false` высота списка ещё не финальная.
  useLayoutEffect(() => {
    if (loading || error) return
    if (scrollRestoreDoneRef.current) return
    scrollRestoreDoneRef.current = true
    const raw = sessionStorage.getItem(HISTORY_SCROLL_STORAGE_KEY)
    if (raw == null) return
    const y = Number.parseInt(raw, 10)
    if (!Number.isFinite(y) || y < 0) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo(0, y)
      })
    })
  }, [loading, error])

  // --- Загрузка записей ---
  useEffect(() => {
    let cancelled = false
    api.deeds
      .listAllRecordsWithDeedInfo()
      .then((records) => {
        if (cancelled) return
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
        setRecordsWithDeed(all)
      })
      .catch((e) => {
        if (!cancelled) {
          const msg = e?.message ?? ''
          if (msg.includes('Failed to fetch') || msg.includes('fetch')) {
            setError('Нет связи с сервером. Проверьте интернет и что приложение может обращаться к Supabase.')
          } else {
            setError(msg || 'Ошибка загрузки')
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

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

  // --- Рендер состояний ---
  if (loading) {
    return <PageLoading title="" titleReserve actionsReserveCount={1} />
  }

  if (error) {
    return (
      <Box p="4">
        <Text color="crimson">{error}</Text>
      </Box>
    )
  }

  // --- Основной контент ---
  return (
    <Box
      className={layoutStyles.pageContainer}>
      <AppBar title={`История`} 
      actions={
        <Badge 
        size="2" 
        color="gray" 
        variant="soft"
        radius="full"
        >
          {pluralRecords(recordsWithDeed.length)}
        </Badge>
      } />

      {byDate.length === 0 ? (
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
              <HomeIcon />
              Перейти к делам
            </Link>
          </Button>
        </Flex>
      ) : (
        <Flex direction="column" gap="5" mt="2">
          {byDate.map(([date, records], index) => {
            const recordYear = Number.parseInt(date.slice(0, 4), 10)
            const currentYear = new Date().getFullYear()
            const prevDateStr = index > 0 ? byDate[index - 1]![0] : null
            const prevYear = prevDateStr != null ? Number.parseInt(prevDateStr.slice(0, 4), 10) : null
            // Для любого года, кроме текущего, перед первой датой этого года показываем строку с годом (например «2025», затем «31 декабря 2025»).
            const showYearHeading = recordYear !== currentYear && prevYear !== recordYear

            return (
            <Box key={date}>
              {showYearHeading ? (
                <Heading as="h2" mb="2">
                  {recordYear}
                </Heading>
              ) : null}
              <Flex justify="between" align="center" gap="2" mb="2">
                <Text weight="medium">
                  {formatDate(date)}
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
              <Flex direction="column" gap="2">
                {records.map((rec) => (
                  <RecordCard
                    key={rec.id}
                    record={rec}
                    blocks={rec.deed?.blocks ?? []}
                    deedPrefix={rec.deed ? { emoji: rec.deed.emoji, name: rec.deed.name } : undefined}
                    linkState={{ from: 'history' }}
                  />
                ))}
              </Flex>
            </Box>
            )
          })}
        </Flex>
      )}
    </Box>
  )
}
