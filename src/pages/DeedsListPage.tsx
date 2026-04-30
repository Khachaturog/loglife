import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Button, DropdownMenu, Flex, Heading, IconButton, Text } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import { PageLoading } from '@/components/PageLoading'
import { PageErrorState } from '@/components/PageErrorState'
import { api } from '@/lib/api'
import { DeedCard } from '@/components/DeedCard'
import type { DeedWithBlocks } from '@/types/database'
import layoutStyles from '@/styles/layout.module.css'
import type { RecordRow, RecordAnswerRow } from '@/types/database'
import { CaretSortIcon, DotsHorizontalIcon, PlusIcon, QuestionMarkCircledIcon } from '@radix-ui/react-icons'
import { useOnboarding } from '@/lib/onboarding-context'
import { getDeedDisplayNumbers } from '@/lib/deed-utils'

/** Режим сортировки списка на главной: метрики совпадают с подписью карточки «N сегодня · M всего». */
type DeedSortMode = 'default' | 'today' | 'total'

const DEEDS_LIST_SORT_STORAGE_KEY = 'log-life:deeds-list-sort'

/** Восстановление из localStorage; невалидное значение — как «По умолчанию». */
function readStoredDeedSortMode(): DeedSortMode {
  try {
    const raw = localStorage.getItem(DEEDS_LIST_SORT_STORAGE_KEY)
    if (raw === 'default' || raw === 'today' || raw === 'total') return raw
  } catch {
    /* приватный режим и т.п. */
  }
  return 'default'
}

function deedCreatedAtDesc(a: DeedWithBlocks, b: DeedWithBlocks): number {
  const ta = new Date(a.created_at).getTime()
  const tb = new Date(b.created_at).getTime()
  return tb - ta
}

/**
 * Страница списка дел.
 * Показывает дела с фильтром по категории, статистику (сегодня/всего) и кнопку добавления записи.
 *
 * Прогрессивная загрузка: список дел появляется сразу после первого запроса,
 * счётчики записей (сегодня/всего) доподгружаются вторым запросом (плейсхолдер, без ложных нулей).
 * Сортировка по выпадающему меню — по тем же today/total, что на карточке; порядок по умолчанию — как из API (created_at убывание).
 * Выбор сортировки сохраняется в `localStorage` (этот браузер); после F5 и при следующих визитах не теряется, пока не очищены данные сайта.
 */
export function DeedsListPage() {
  const { openFlow } = useOnboarding()
  // --- Состояние ---
  const [deeds, setDeeds] = useState<DeedWithBlocks[]>([])
  const [recordsByDeedId, setRecordsByDeedId] = useState<Record<string, (RecordRow & { record_answers?: RecordAnswerRow[] })[]>>({})
  // deedsLoading — полный экран; recordsLoading — только счётчики на карточках (второй запрос)
  const [deedsLoading, setDeedsLoading] = useState(true)
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<DeedSortMode>(() => readStoredDeedSortMode())

  // Запись выбора сортировки: без частых сбросов при обычном F5/возврате на вкладку.
  useEffect(() => {
    try {
      localStorage.setItem(DEEDS_LIST_SORT_STORAGE_KEY, sortMode)
    } catch {
      /* квота / приватный режим */
    }
  }, [sortMode])

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
        if (data.length === 0) {
          setRecordsLoading(false)
        } else {
          setRecordsLoading(true)
        }
        return api.deeds.recordsByDeedIds(data.map((d) => d.id), { skipDeedCheck: true })
      })
      .then((byId) => {
        // Записи приходят позже — счётчики обновятся без перерисовки всего списка
        if (cancelled || !byId) return
        setRecordsByDeedId(byId)
        setRecordsLoading(false)
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message ?? 'Ошибка загрузки')
          setDeedsLoading(false)
          setRecordsLoading(false)
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

  // Список после фильтра категории и опциональной сортировки (по числам карточки, убывание; ничья — по created_at из API).
  const deedsForList = useMemo(() => {
    if (sortMode === 'default') return filteredDeeds
    const rows = filteredDeeds.map((deed) => {
      const records = recordsByDeedId[deed.id] ?? []
      const { today, total } = getDeedDisplayNumbers(deed.blocks ?? [], records)
      return { deed, today, total }
    })
    rows.sort((a, b) => {
      const primary =
        sortMode === 'today' ? b.today - a.today : b.total - a.total
      if (primary !== 0) return primary
      return deedCreatedAtDesc(a.deed, b.deed)
    })
    return rows.map((r) => r.deed)
  }, [filteredDeeds, recordsByDeedId, sortMode])

  /** После быстрого «+» на карточке (один блок «Да/Нет») подтягиваем записи и обновляем счётчики. */
  const refreshRecordsForDeed = useCallback(async (deedId: string) => {
    const recs = await api.deeds.records(deedId)
    setRecordsByDeedId((prev) => ({ ...prev, [deedId]: recs }))
  }, [])

  // --- Рендер состояний загрузки и ошибки ---
  if (deedsLoading) {
    return <PageLoading title="" titleReserve actionsReserveCount={2} />
  }

  if (error) {
    const networkHint =
      /failed to fetch|load failed/i.test(error)
        ? 'Проверьте интернет и что приложение может обращаться к серверу. Затем обновите страницу.'
        : 'Попробуйте обновить страницу. Если ошибка повторяется — зайдите позже.'
    return (
      <Flex direction="column" style={{ flex: 1, minHeight: 0, width: '100%' }}>
        <Box className={layoutStyles.pageContainer}>
          <AppBar title="" titleReserve actionsReserveCount={2} />
        </Box>
        <Box className={layoutStyles.pageContainer} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <PageErrorState
            withPageContainer={false}
            title="Не удалось загрузить дела"
            description={networkHint}
            code={error}
          />
        </Box>
      </Flex>
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
        /* Основные действия главной — в overflow-меню (позже добавим пункты). «Создать» не дублируем текстовой кнопкой. */
        actions={
          <Flex gap="2">
            {/* Сортировка: те же метрики, что на карточке (getDeedDisplayNumbers). */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButton
                  type="button"
                  size="3"
                  color="gray"
                  variant="classic"
                  radius="full"
                  aria-label="Сортировка списка"
                >
                  <CaretSortIcon />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content variant="solid" size="2" align="end" sideOffset={8}>
                <DropdownMenu.Label>Сортировка</DropdownMenu.Label>
                <DropdownMenu.RadioGroup
                  value={sortMode}
                  onValueChange={(v) => {
                    setSortMode(v as DeedSortMode)
                  }}
                >
                  <DropdownMenu.RadioItem value="default">
                    По умолчанию
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem value="today">
                    По количеству сегодня
                  </DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem value="total">
                    По количеству всего
                  </DropdownMenu.RadioItem>
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <IconButton
                  type="button"
                  size="3"
                  color="gray"
                  variant="classic"
                  radius="full"
                  aria-label="Меню действий"
                >
                  <DotsHorizontalIcon />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content variant="solid" size="2" align="end" sideOffset={8}>
                <DropdownMenu.Item asChild>
                  <Link to="/deeds/new"> <PlusIcon /> Создать дело</Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item color="gray" onSelect={() => openFlow('help_deeds_list')}>
                  <QuestionMarkCircledIcon /> Справка
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </Flex>
        }
      />

      {/* Фильтр по категориям (скрыт, если нет дел или категорий) */}
      {deeds.length > 0 && categories.length > 0 && (
        <Flex gap="2" mb="5" wrap="wrap">
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
          {deedsForList.map((deed) => (
            <DeedCard
              key={deed.id}
              deed={deed}
              records={recordsByDeedId[deed.id] ?? []}
              countersLoading={recordsLoading}
              onRecordsRefresh={refreshRecordsForDeed}
            />
          ))}
        </Flex>
      )}
    </Box>
  )
}
