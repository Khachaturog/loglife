import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Button, Flex, Heading, Text } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import { PageLoading } from '@/components/PageLoading'
import { api } from '@/lib/api'
import { DeedCard } from '@/components/DeedCard'
import type { DeedWithBlocks } from '@/types/database'
import layoutStyles from '@/styles/layout.module.css'
import type { RecordRow, RecordAnswerRow } from '@/types/database'
import { PlusIcon } from '@radix-ui/react-icons'

/**
 * Страница списка дел.
 * Показывает дела с фильтром по категории, статистику (сегодня/всего) и кнопку добавления записи.
 *
 * Прогрессивная загрузка: список дел появляется сразу после первого запроса,
 * счётчики записей (сегодня/всего) доподгружаются вторым запросом незаметно.
 */
export function DeedsListPage() {
  // --- Состояние ---
  const [deeds, setDeeds] = useState<DeedWithBlocks[]>([])
  const [recordsByDeedId, setRecordsByDeedId] = useState<Record<string, (RecordRow & { record_answers?: RecordAnswerRow[] })[]>>({})
  // Два флага загрузки: deedsLoading блокирует рендер, recordsLoading — нет
  const [deedsLoading, setDeedsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  // --- Загрузка дел и записей ---
  useEffect(() => {
    let cancelled = false
    api.deeds
      .listWithBlocks()
      .then((data) => {
        if (cancelled) return null
        // Показываем список дел немедленно, не ждём второго запроса
        setDeeds(data)
        setDeedsLoading(false)
        // DeedCard умеет работать с пустым records[] — покажет «0 сегодня, 0 всего»
        return api.deeds.recordsByDeedIds(data.map((d) => d.id), { skipDeedCheck: true })
      })
      .then((byId) => {
        // Записи приходят позже — счётчики обновятся без перерисовки всего списка
        if (cancelled || !byId) return
        setRecordsByDeedId(byId)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message ?? 'Ошибка загрузки')
          setDeedsLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [])

  // --- Вычисляемые данные ---
  // Уникальные категории из дел, «Без категории» в конце
  const categories = useMemo(() => {
    const set = new Set<string>()
    for (const d of deeds) {
      const c = d.category?.trim()
      set.add(c ? c : 'Без категории')
    }
    return Array.from(set).sort((a, b) => {
      if (a === 'Без категории') return 1
      if (b === 'Без категории') return -1
      return a.localeCompare(b)
    })
  }, [deeds])

  // Дела, отфильтрованные по выбранной категории
  const filteredDeeds = useMemo(() => {
    if (!selectedCategory) return deeds
    if (selectedCategory === 'Без категории') {
      return deeds.filter((d) => !d.category?.trim())
    }
    return deeds.filter((d) => (d.category?.trim() ?? '') === selectedCategory)
  }, [deeds, selectedCategory])

  /** После быстрого «+» на карточке (один блок «Да/Нет») подтягиваем записи и обновляем счётчики. */
  const refreshRecordsForDeed = useCallback(async (deedId: string) => {
    const recs = await api.deeds.records(deedId)
    setRecordsByDeedId((prev) => ({ ...prev, [deedId]: recs }))
  }, [])

  // --- Рендер состояний загрузки и ошибки ---
  if (deedsLoading) {
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
      className={layoutStyles.pageContainer}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <AppBar
        title="Дела"
        /* В пустом состоянии CTA только в центре экрана — дублировать «Создать» в хедере не нужно */
        actions={
          deeds.length > 0 ? (
            <Button size="3" variant="ghost" radius="large" color="gray" asChild aria-label="Создать дело">
              <Link to="/deeds/new">Создать</Link>
            </Button>
          ) : undefined
        }
      />

      {/* Фильтр по категориям (скрыт, если нет дел или категорий) */}
      {deeds.length > 0 && categories.length > 0 && (
        <Flex gap="2" mb="4" wrap="wrap">
          <Button
            type="button"
            color='gray'
            variant={selectedCategory === null ? 'classic' : 'soft'}
            size="2"
            onClick={() => setSelectedCategory(null)}
          >
            Все
          </Button>
          {categories.map((cat) => (
            <Button
              key={cat}
              type="button"
              color='gray'
              variant={selectedCategory === cat ? 'classic' : 'soft'}
              size="2"
              onClick={() => setSelectedCategory(cat)}
            >
              {cat}
            </Button>
          ))}
        </Flex>
      )}

      {/* Пустое состояние: по центру видимой области (minHeight — запас под AppBar и TabBar) */}
      {deeds.length === 0 ? (
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
              Пока нет дел
            </Heading>
            <Text size="2" color="gray" align="center">
              Создай первое дело и&nbsp;начни вести записи
            </Text>
          </Flex>
          <Button 
          size="3" 
          variant="classic" 
          aria-label="Создать дело"
          radius="full"
          asChild>
            <Link to="/deeds/new">
              <PlusIcon />
              Создать дело
            </Link>
          </Button>
        </Flex>
      ) : (
        <Flex direction="column" gap="2">
          {/* Карточки дел: клик по левой части — просмотр, кнопка + — добавить запись */}
          {filteredDeeds.map((deed) => (
            <DeedCard
              key={deed.id}
              deed={deed}
              records={recordsByDeedId[deed.id] ?? []}
              onRecordsRefresh={refreshRecordsForDeed}
            />
          ))}
        </Flex>
      )}
    </Box>
  )
}
