import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Badge, Box, Card, Flex, Heading, IconButton, Separator, Text } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import { PageLoading } from '@/components/PageLoading'
import { Pencil1Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { api } from '@/lib/api'
import { RecordCard } from '@/components/RecordCard'
import type { DeedWithBlocks, RecordRow } from '@/types/database'
import layoutStyles from '@/styles/layout.module.css'
import styles from './DeedViewPage.module.css'
import { formatDate, pluralRecords, todayLocalISO } from '@/lib/format-utils'
import { currentStreak, maxStreak, workdayWeekendCounts } from '@/lib/deed-analytics'

/**
 * Страница просмотра дела.
 * Показывает заголовок, описание, аналитику (стрики, рабочие/выходные дни) и историю записей по датам.
 */
export function DeedViewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // --- Состояние ---
  const [deed, setDeed] = useState<DeedWithBlocks | null>(null)
  const [records, setRecords] = useState<(RecordRow & { record_answers?: { block_id: string; value_json: unknown }[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  // --- Удаление дела (с подтверждением) ---
  const handleDelete = async () => {
    if (!id) return
    if (!confirm('Удалить дело? Все записи также будут удалены.')) return
    try {
      await api.deeds.delete(id)
      navigate('/')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Не удалось удалить дело'
      setError(msg)
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

  // Аналитика: стрики и распределение по рабочим/выходным (только если есть записи)
  const analytics = useMemo(() => {
    if (records.length === 0) return null
    return {
      currentStreak: currentStreak(records),
      maxStreak: maxStreak(records),
      workdayWeekend: workdayWeekendCounts(records),
    }
  }, [records])

  // Количества "сегодня / этот месяц / всего" считаем как количество записей.
  const displayNumbers = useMemo(() => {
    const deedBlocks = deed?.blocks ?? []
    const numericBlocks = deedBlocks
      .filter((b) => b.block_type === 'number' || b.block_type === 'scale' || b.block_type === 'duration')
      .sort((a, b) => a.sort_order - b.sort_order)

    // Берем "первый" числовой блок (по sort_order) и суммируем только его значения.
    const firstNumeric = numericBlocks[0]
    if (!firstNumeric) return { today: 0, month: 0, total: 0 }

    const todayISO = todayLocalISO()

    const getValueFromAnswer = (valueJson: unknown, blockType: 'number' | 'scale' | 'duration'): number => {
      // value_json приходит как JSON; нет ответа по блоку или пустой JSON — не падаем на v.number.
      if (valueJson == null || typeof valueJson !== 'object') return 0
      const v = valueJson as Partial<{ number: number; scaleValue: number; durationHms: string }>
      if (blockType === 'number' && typeof v.number === 'number') return Number(v.number) || 0
      if (blockType === 'scale' && typeof v.scaleValue === 'number') return Number(v.scaleValue) || 0
      if (blockType === 'duration' && typeof v.durationHms === 'string') {
        const hms = v.durationHms ?? '0:0:0'
        const [h, m, s] = hms.split(':').map((x) => parseInt(x, 10) || 0)
        return h * 3600 + m * 60 + s
      }
      return 0
    }

    const getRecordValue = (r: (typeof records)[number]): number => {
      const answer = r.record_answers?.find((a) => a.block_id === firstNumeric.id)
      // Мы знаем, что нас интересует только firstNumeric.block_type.
      return getValueFromAnswer(answer?.value_json, firstNumeric.block_type as 'number' | 'scale' | 'duration')
    }

    const total = records.reduce((sum, r) => sum + getRecordValue(r), 0)

    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() // 0-11

    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const monthEndDate = new Date(year, month + 1, 0).getDate()
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(monthEndDate).padStart(2, '0')}`

    const today = records.filter((r) => r.record_date === todayISO).reduce((sum, r) => sum + getRecordValue(r), 0)
    const monthTotal = records
      .filter((r) => r.record_date >= monthStart && r.record_date <= monthEnd)
      .reduce((sum, r) => sum + getRecordValue(r), 0)

    return { today, month: monthTotal, total }
  }, [deed, records])

  // --- Рендер состояний загрузки и ошибки ---
  if (loading) {
    return <PageLoading backHref="/" title="" actionsReserveCount={3} />
  }

  if (error || !deed) {
    return (
      <Box p="4">
        <AppBar backHref="/" />
        <Text as="p" color="crimson" mt="2">
          {error ?? 'Дело не найдено'}
        </Text>
      </Box>
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
            <IconButton asChild size="3" variant="classic" radius="full" aria-label="Добавить запись">
              <Link to={`/deeds/${id}/fill`}>
                <PlusIcon width={18} height={18} />
              </Link>
            </IconButton>
            <IconButton asChild size="3" color="gray" variant="classic" radius="full" aria-label="Редактировать дело">
              <Link to={`/deeds/${id}/edit`}>
                <Pencil1Icon width={18} height={18} />
              </Link>
            </IconButton>
            <Separator orientation="vertical"/>
            <IconButton
              type="button"
              size="3"
              color="red"
              variant="classic"
              radius="full"
              aria-label="Удалить дело"
              onClick={handleDelete}
            >
              <TrashIcon width={18} height={18} />
            </IconButton>
          </Flex>
        }
      />
    <Flex direction="column" gap="2">
      <Flex direction="column" gap="2">
        <Heading size="5">
          {`${deed.emoji} ${deed.name}`}
        </Heading>

        {/* {deed.category && (
          <Text as="p" size="2" color="gray" >
          Категория: {deed.category}
          </Text>
          )} */}

        {deed.description && (
          <Text as="p" size="2">
            {deed.description}
          </Text>
        )}
      </Flex>

      <Box py="3" className={styles.analyticsSection}>

        <Flex direction="row" gap="2" wrap="wrap" mb="2">
          <Card style={{ flex: '1' }}>
            <Flex direction="column" gap="1">
              <Text size="2" color="gray">Сегодня</Text>
              <Text weight="bold" size="4">
                {displayNumbers.today}
              </Text>
            </Flex>
          </Card>

          <Card style={{ flex: '1' }}>
            <Flex direction="column" gap="1">
              <Text size="2" color="gray">В этом месяце</Text>
              <Text weight="bold" size="4">
                {displayNumbers.month}
              </Text>
            </Flex>
          </Card>

          <Card style={{ flex: '1' }}>
            <Flex direction="column" gap="1">
              <Text size="2" color="gray">Всего</Text>
              <Text weight="bold" size="4">
                {displayNumbers.total}
              </Text>
            </Flex>
          </Card>
        </Flex>

        {/* Сырые данные по стрику/рабочие-выходные (показываем только если есть записи) */}
        {analytics && (
          <Flex direction="row" gap="2" wrap="wrap">

            <Card style={{ flex: '1' }}>
              <Flex direction="column" gap="1" mb="2">
                <Text size="2" color="gray">Текущий стрик</Text>
                <Text size="4">{analytics.currentStreak}</Text>
              </Flex>

              <Flex direction="row" gap="1">
                <Text size="2" color="gray">Максимум:</Text>
                <Text size="2" >{analytics.maxStreak}</Text>
              </Flex>
            </Card>

            <Card style={{ flex: '1' }}>
              <Flex direction="column" gap="1" mb="2">
                <Text size="2" color="gray">Всего</Text> 
                <Text size="4">{pluralRecords(records.length)}</Text> 
              </Flex>

              <Flex direction="row" gap="2">
                <Flex direction="row" gap="1">
                  <Text size="2" color="gray">Рабочие:</Text>
                  <Text size="2" >{analytics.workdayWeekend.workday}</Text>
                </Flex>
                <Text size="2" color="gray">·</Text>
                <Flex direction="row" gap="1">
                  <Text size="2" color="gray">Выходные:</Text>
                  <Text size="2" >{analytics.workdayWeekend.weekend}</Text>
                </Flex>
              </Flex>
            </Card>
            
          </Flex>
          
        )}
      </Box>

      {/* История записей по датам */}
      <Flex align="center" justify="between" gap="2" mt="4" mb="2">
        <Heading size="3">История</Heading>
        <Badge 
        size="2" 
        color="gray" 
        variant="soft" 
        radius="full">
          {records.length}
        </Badge>
      </Flex>

      {records.length === 0 ? (
        <Text as="p" color="gray">
          Пока нет записей. Добавьте первую.
        </Text>
      ) : (
        <Flex direction="column" gap="4">
          {byDate.map(([date, dayRecords]) => (
            <Box key={date}>
              <Flex justify="between" align="center" gap="2" mb="2">
                <Text weight="medium">
                  {formatDate(date)}
                </Text>
                <Badge 
                size="2" 
                color="gray" 
                variant="soft" 
                radius="full">
                  {dayRecords.length}
                </Badge>
              </Flex>
              
              <Flex direction="column" gap="2">
                {dayRecords.map((rec) => (
                  <RecordCard
                    key={rec.id}
                    record={rec}
                    blocks={deed.blocks ?? []}
                    avatarFallback={deed.emoji}
                  />
                ))}
              </Flex>
            </Box>
          ))}
        </Flex>
      )}
      </Flex>
    </Box>
  )
}
