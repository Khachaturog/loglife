import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Box, Button, DropdownMenu, Flex, Grid, Heading, IconButton, Text } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import { PageLoading } from '@/components/PageLoading'
import { PullToRefresh } from '@/components/PullToRefresh'
import { PageErrorState } from '@/components/PageErrorState'
import { api } from '@/lib/api'
import { DeedCard } from '@/components/DeedCard'
import type { DeedWithBlocks } from '@/types/database'
import layoutStyles from '@/styles/layout.module.css'
import styles from './DeedsListPage.module.css'
import type { RecordRow, RecordAnswerRow } from '@/types/database'
import { ChevronsUpDown, Ellipsis, List, Grid3x3, Plus, CircleQuestionMark, Calendar, UnfoldHorizontal, Shrink } from 'lucide-react'
import { DeedsCalendarView, type CalendarColumnsMode } from '@/components/DeedsCalendarView'
import { useOnboarding } from '@/lib/onboarding-context'
import { normalizeDeedAnalyticsConfig } from '@/lib/deed-analytics-config'
import { getDeedDisplayNumbers } from '@/lib/deed-utils'
import { todayLocalISO } from '@/lib/format-utils'

/** Режим сортировки списка на главной: по умолчанию или по числу за сегодня на карточке. */
type DeedSortMode = 'default' | 'today'

/** list — колонка; cards — сетка; calendar — дни месяца × дела. */
type DeedListViewMode = 'list' | 'cards' | 'calendar'

const DEEDS_LIST_SORT_STORAGE_KEY = 'log-life:deeds-list-sort'
const DEEDS_LIST_VIEW_STORAGE_KEY = 'log-life:deeds-list-view'
const CALENDAR_COLUMNS_STORAGE_KEY = 'log-life:deeds-calendar-columns'

/** Восстановление из localStorage; «всего» и прочее невалидное — как «По умолчанию». */
function readStoredDeedSortMode(): DeedSortMode {
  try {
    const raw = localStorage.getItem(DEEDS_LIST_SORT_STORAGE_KEY)
    if (raw === 'default' || raw === 'today') return raw
  } catch {
    /* приватный режим и т.п. */
  }
  return 'default'
}

/** Восстановление вида списка; невалидное значение — колонка, как до появления настройки. */
function readStoredDeedListViewMode(): DeedListViewMode {
  try {
    const raw = localStorage.getItem(DEEDS_LIST_VIEW_STORAGE_KEY)
    if (raw === 'list' || raw === 'cards' || raw === 'calendar') return raw
  } catch {
    /* приватный режим и т.п. */
  }
  return 'list'
}

function readStoredCalendarColumnsMode(): CalendarColumnsMode {
  try {
    const raw = localStorage.getItem(CALENDAR_COLUMNS_STORAGE_KEY)
    if (raw === 'scroll' || raw === 'fit') return raw
  } catch {
    /* приватный режим и т.п. */
  }
  return 'scroll'
}

function deedCreatedAtDesc(a: DeedWithBlocks, b: DeedWithBlocks): number {
  const ta = new Date(a.created_at).getTime()
  const tb = new Date(b.created_at).getTime()
  return tb - ta
}

/**
 * Страница списка дел.
 * Показывает дела с фильтром по категории, число за сегодня и кнопку добавления записи.
 *
 * Прогрессивная загрузка: список дел появляется сразу после первого запроса,
 * число за сегодня доподгружается вторым запросом только за сегодняшний день (плейсхолдер, без ложных нулей).
 * Сортировка — по этому же числу или порядок по умолчанию (created_at убывание из API).
 * Выбор сортировки и вида (список / карточки / календарь) сохраняется в `localStorage` (этот браузер); после F5 и при следующих визитах не теряется, пока не очищены данные сайта.
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
  const [viewMode, setViewMode] = useState<DeedListViewMode>(() => readStoredDeedListViewMode())
  const [calendarColumnsMode, setCalendarColumnsMode] = useState<CalendarColumnsMode>(() => readStoredCalendarColumnsMode())
  // Календарь сам грузит месяц; жест вниз увеличивает токен, чтобы перечитать сетку.
  const [calendarReloadToken, setCalendarReloadToken] = useState(0)
  const pageRef = useRef<HTMLDivElement>(null)
  /** Календарь занимает экран целиком: документ не крутится, только сетка и лист дня. */
  const calendarLock = viewMode === 'calendar' && !deedsLoading && !error && deeds.length > 0

  // Запись выбора сортировки: без частых сбросов при обычном F5/возврате на вкладку.
  useEffect(() => {
    try {
      localStorage.setItem(DEEDS_LIST_SORT_STORAGE_KEY, sortMode)
    } catch {
      /* квота / приватный режим */
    }
  }, [sortMode])

  useEffect(() => {
    try {
      localStorage.setItem(DEEDS_LIST_VIEW_STORAGE_KEY, viewMode)
    } catch {
      /* квота / приватный режим */
    }
  }, [viewMode])

  // Высота 100% по цепочке до html, иначе колонка растёт и скроллится вся страница.
  useEffect(() => {
    if (!calendarLock) return
    const page = pageRef.current
    if (!page) return
    const nodes: HTMLElement[] = []
    let node: HTMLElement | null = page.parentElement
    while (node) {
      nodes.push(node)
      node = node.parentElement
    }
    const prev = nodes.map((el) => ({
      el,
      height: el.style.height,
      maxHeight: el.style.maxHeight,
      minHeight: el.style.minHeight,
      overflow: el.style.overflow,
      overscroll: el.style.overscrollBehavior,
      scrollbarGutter: el.style.scrollbarGutter,
      boxSizing: el.style.boxSizing,
    }))
    // У main уже есть padding под TabBar. Потомкам нельзя ставить 100dvh: это выше родителя, и лист заезжает на бар.
    const mainIndex = nodes.findIndex((el) => String(el.className).includes('mainWithTabBar'))
    nodes.forEach((el, index) => {
      const aboveMain = mainIndex >= 0 && index > mainIndex
      el.style.boxSizing = 'border-box'
      el.style.height = '100%'
      el.style.maxHeight = aboveMain ? '100dvh' : '100%'
      el.style.minHeight = '0'
      el.style.overflow = 'hidden'
      el.style.overscrollBehavior = 'none'
      if (el === document.documentElement) el.style.scrollbarGutter = 'auto'
    })
    return () => {
      for (const item of prev) {
        item.el.style.height = item.height
        item.el.style.maxHeight = item.maxHeight
        item.el.style.minHeight = item.minHeight
        item.el.style.overflow = item.overflow
        item.el.style.overscrollBehavior = item.overscroll
        item.el.style.scrollbarGutter = item.scrollbarGutter
        item.el.style.boxSizing = item.boxSizing
      }
    }
  }, [calendarLock])

  useEffect(() => {
    try {
      localStorage.setItem(CALENDAR_COLUMNS_STORAGE_KEY, calendarColumnsMode)
    } catch {
      /* квота / приватный режим */
    }
  }, [calendarColumnsMode])

  // Первый заход — полный экран. Жест вниз вызывает ту же загрузку без этого флага и без экрана ошибки.
  const loadDeeds = useCallback(async (mode: 'initial' | 'refresh', isCancelled?: () => boolean) => {
    if (mode === 'initial') {
      setDeedsLoading(true)
      setError(null)
    }
    try {
      const data = await api.deeds.listWithBlocks()
      if (isCancelled?.()) return
      // Список показываем сразу, счётчики за сегодня — вторым запросом.
      setDeeds(data)
      if (data.length === 0) {
        setRecordsByDeedId({})
        setRecordsLoading(false)
        return
      }
      // При обновлении жестом числа на карточках остаются, пока не придёт ответ.
      if (mode === 'initial') setRecordsLoading(true)
      const byId = await api.deeds.recordsByDeedIds(data.map((d) => d.id), {
        skipDeedCheck: true,
        recordDate: todayLocalISO(),
      })
      if (isCancelled?.()) return
      setRecordsByDeedId(byId)
      if (mode === 'refresh') setCalendarReloadToken((token) => token + 1)
    } catch (e: unknown) {
      if (isCancelled?.()) return
      if (mode === 'initial') {
        const message = e instanceof Error ? e.message : 'Ошибка загрузки'
        setError(message)
      }
    } finally {
      if (isCancelled?.()) return
      if (mode === 'initial') setDeedsLoading(false)
      setRecordsLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadDeeds('initial', () => cancelled)
    return () => { cancelled = true }
  }, [loadDeeds])

  const refreshDeeds = useCallback(() => loadDeeds('refresh'), [loadDeeds])

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

  // Список после фильтра категории и сортировки по числу за сегодня (убывание; ничья — по created_at из API).
  const deedsForList = useMemo(() => {
    if (sortMode === 'default') return filteredDeeds
    const rows = filteredDeeds.map((deed) => {
      const records = recordsByDeedId[deed.id] ?? []
      const summaryBlockId = normalizeDeedAnalyticsConfig(deed.analytics_config).summary.block_id
      const { today } = getDeedDisplayNumbers(deed.blocks ?? [], records, summaryBlockId)
      return { deed, today }
    })
    rows.sort((a, b) => {
      const primary = b.today - a.today
      if (primary !== 0) return primary
      return deedCreatedAtDesc(a.deed, b.deed)
    })
    return rows.map((r) => r.deed)
  }, [filteredDeeds, recordsByDeedId, sortMode])

  /** После быстрого «+» подтягиваем только записи за сегодня и обновляем число на карточке. */
  const refreshRecordsForDeed = useCallback(async (deedId: string) => {
    const byId = await api.deeds.recordsByDeedIds([deedId], {
      skipDeedCheck: true,
      recordDate: todayLocalISO(),
    })
    setRecordsByDeedId((prev) => ({ ...prev, [deedId]: byId[deedId] ?? [] }))
  }, [])

  // --- Рендер состояний загрузки и ошибки ---
  if (deedsLoading) {
    return <PageLoading title="" titleReserve actionsReserveCount={viewMode === 'calendar' ? 1 : 2} />
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
    <PullToRefresh onRefresh={refreshDeeds} disabled={viewMode === 'calendar'}>
    <Box
      ref={pageRef}
      className={`${layoutStyles.pageContainer}${calendarLock ? ` ${styles.calendarPage}` : ''}`}
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <AppBar
        title="Дела"
        /* Основные действия главной — в overflow-меню (позже добавим пункты). «Создать» не дублируем текстовой кнопкой. */
        actions={
          <Flex gap="2">
            {/* В календаре порядок столбцов фиксирован (как «по умолчанию»), меню сортировки не нужно. */}
            {viewMode !== 'calendar' && (
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
                  <ChevronsUpDown size={16} />
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
                </DropdownMenu.RadioGroup>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            )}
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
                  <Ellipsis size={16} />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content variant="solid" size="2" align="end" sideOffset={8}>
                <DropdownMenu.Item asChild>
                  <Link to="/deeds/new"> <Plus size={16} /> Создать дело</Link>
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Label>Вид</DropdownMenu.Label>
                <DropdownMenu.RadioGroup
                  value={viewMode}
                  onValueChange={(v) => {
                    setViewMode(v as DeedListViewMode)
                  }}
                >
                  <DropdownMenu.RadioItem value="list"> <List size={16} /> Список</DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem value="cards"> <Grid3x3 size={16} /> Карточки</DropdownMenu.RadioItem>
                  <DropdownMenu.RadioItem value="calendar"> <Calendar size={16} /> Календарь</DropdownMenu.RadioItem>
                </DropdownMenu.RadioGroup>
                {viewMode === 'calendar' && (
                  <>
                    <DropdownMenu.Separator />
                    <DropdownMenu.Label>Столбцы</DropdownMenu.Label>
                    <DropdownMenu.RadioGroup
                      value={calendarColumnsMode}
                      onValueChange={(value) => setCalendarColumnsMode(value as CalendarColumnsMode)}
                    >
                      <DropdownMenu.RadioItem value="scroll">
                        <UnfoldHorizontal size={16} /> С прокруткой
                      </DropdownMenu.RadioItem>
                      <DropdownMenu.RadioItem value="fit">
                        <Shrink size={16} /> По ширине
                      </DropdownMenu.RadioItem>
                    </DropdownMenu.RadioGroup>
                  </>
                )}
                <DropdownMenu.Separator />
                <DropdownMenu.Item color="gray" onSelect={() => openFlow('help_deeds_list')}>
                  <CircleQuestionMark size={16} /> Справка
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </Flex>
        }
      />

      {/* Фильтр по категориям (скрыт, если нет дел или категорий) */}
      {deeds.length > 0 && categories.length > 0 && (
        <Flex gap="1" mb="4" wrap="wrap" className={styles.categoryRow}>
          <Button
            type="button"
            color='gray'
            variant={selectedCategory === null ? 'classic' : 'soft'}
            size="2"
            radius="full"
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
              radius="full"
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
              <Plus size={16} />
              Создать дело
            </Link>
          </Button>
        </Flex>
      ) : (
        /* Вид из меню «⋯»: колонка, сетка или календарь месяца. */
        viewMode === 'calendar' ? (
          <DeedsCalendarView
            deeds={filteredDeeds}
            reloadToken={calendarReloadToken}
            onRecordsRefresh={refreshRecordsForDeed}
            columnsMode={calendarColumnsMode}
          />
        ) : viewMode === 'cards' ? (
          <Grid columns={{ initial: '2', sm: '3' }} gap="2">
            {deedsForList.map((deed) => (
              <DeedCard
                key={deed.id}
                layout="stack"
                deed={deed}
                records={recordsByDeedId[deed.id] ?? []}
                countersLoading={recordsLoading}
                onRecordsRefresh={refreshRecordsForDeed}
              />
            ))}
          </Grid>
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
        )
      )}
    </Box>
    </PullToRefresh>
  )
}
