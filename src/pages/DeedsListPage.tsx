import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Button, Flex, IconButton, Link as RadixLink, Text } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import { PageLoading } from '@/components/PageLoading'
import { PlusIcon } from '@radix-ui/react-icons'
import { api } from '@/lib/api'
import { DeedCard } from '@/components/DeedCard'
import type { DeedWithBlocks } from '@/types/database'
import layoutStyles from '@/styles/layout.module.css'
import type { RecordRow, RecordAnswerRow } from '@/types/database'

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
    <Box className={layoutStyles.pageContainer}>
      <AppBar 
      title="Дела" 
      actions={
      <IconButton size="3" variant="classic" radius="full" color="gray" asChild aria-label="Создать дело">
        <Link to="/deeds/new">
          <PlusIcon width={18} height={18} />
        </Link>
      </IconButton>} />

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

      {/* Пустое состояние или список карточек */}
      {deeds.length === 0 ? (
        <Text as="p">
          Нет дел.{' '}
          <RadixLink asChild>
            <Link to="/deeds/new">Создайте первое</Link>
          </RadixLink>
          .
        </Text>
      ) : (
        <Flex direction="column" gap="2">
          {/* Карточки дел: клик по левой части — просмотр, кнопка + — добавить запись */}
          {filteredDeeds.map((deed) => (
            <DeedCard
              key={deed.id}
              deed={deed}
              records={recordsByDeedId[deed.id] ?? []}
            />
          ))}
        </Flex>
      )}
    </Box>
  )
}
