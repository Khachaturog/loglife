import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { Box, Card, Flex, Text, Tooltip } from '@radix-ui/themes'
import {
  buildDeedHeatmap,
  type DeedHeatmapMonthLabel,
} from '@/lib/deed-analytics'
import styles from './DeedActivityHeatmap.module.css'

/**
 * Размеры сетки: должны совпадать с `--heatmap-*` в `DeedActivityHeatmap.module.css`.
 * HEATMAP_CELL_PX / HEATMAP_GAP_PX — также шаг колонок в `gridTemplateColumns`.
 */
const HEATMAP_CELL_PX = 12
const HEATMAP_GAP_PX = 2
const HEATMAP_WEEKDAY_COLUMN_PX = 24
/** Flex `gap="2"` у ряда подписей + сетки (Radix space-2 ≈ 8px). */
const HEATMAP_FLEX_GAP_PX = 8
const HEATMAP_WEEKDAY_GUTTER_PX =
  HEATMAP_WEEKDAY_COLUMN_PX + HEATMAP_FLEX_GAP_PX
const HEATMAP_WEEK_COLUMN_PITCH_PX = HEATMAP_CELL_PX + HEATMAP_GAP_PX

/** Как у `.monthLabelWrap`: 4 квадрата + 3 промежутка — меньше места подпись лучше скрыть. */
const MONTH_LABEL_MIN_WIDTH_PX =
  4 * HEATMAP_CELL_PX + 3 * HEATMAP_GAP_PX

/**
 * Убирает самый левый месяц, если до следующей подписи (или до конца сетки) меньше 54px —
 * иначе контейнер подписи налезает на соседний месяц.
 */
function monthLabelsSkipCrampedLeft(
  labels: DeedHeatmapMonthLabel[],
  weekCount: number,
): DeedHeatmapMonthLabel[] {
  if (labels.length === 0) return labels
  const first = labels[0]
  const pitch = HEATMAP_WEEK_COLUMN_PITCH_PX

  let availablePx: number
  if (labels.length >= 2) {
    availablePx = (labels[1].weekIndex - first.weekIndex) * pitch
  } else {
    const cols = weekCount - first.weekIndex
    if (cols <= 0) availablePx = 0
    else {
      availablePx =
        cols * HEATMAP_CELL_PX + Math.max(0, cols - 1) * HEATMAP_GAP_PX
    }
  }

  if (availablePx < MONTH_LABEL_MIN_WIDTH_PX) {
    return labels.slice(1)
  }
  return labels
}

function getHeatmapVisibleWeeks(
  containerWidthPx: number,
  showWeekdayLabels: boolean,
): number {
  const gutter = showWeekdayLabels ? HEATMAP_WEEKDAY_GUTTER_PX : 0
  const available = Math.max(0, containerWidthPx - gutter)
  const pitch = HEATMAP_WEEK_COLUMN_PITCH_PX
  return Math.max(
    8,
    Math.min(53, Math.floor((available + HEATMAP_GAP_PX) / pitch)),
  )
}

interface DeedActivityHeatmapProps {
  activity: { record_date: string; value: number }[]
  /** Подпись блока (например заголовок) — в тултипе для ненулевого значения. */
  valueLabel?: string
  /**
   * Hex цвет карточки дела (`deeds.card_color`): градиент ячеек и обводка «сегодня».
   * Невалидное значение — игнорируется, используется акцент темы.
   */
  cardColor?: string | null
  /** Колонка Пн…Вс; при false ширина сетки на всю ширину контейнера */
  showWeekdayLabels?: boolean
  showMonthLabels?: boolean
  /** «пик: N» и легенда Меньше/Больше */
  showPeakAndLegend?: boolean
}

/** Совпадает с проверкой в форме дела — только полный #RRGGBB. */
function heatmapAccentStyle(
  cardColor: string | null | undefined,
): CSSProperties | undefined {
  const c = cardColor?.trim()
  if (!c || !/^#[0-9A-Fa-f]{6}$/.test(c)) return undefined
  return { ['--heatmap-accent' as string]: c }
}

const WEEKDAY_LABELS = ['Пн', '', 'Ср', '', 'Пт', '', 'Вс']

/** Классы уровней 1–4; индекс 0 → level 1. */
const LEVEL_CLASSES = [
  styles.level1,
  styles.level2,
  styles.level3,
  styles.level4,
] as const

function formatHeatmapDateLabel(
  isoDate: string,
  value: number,
  valueLabel?: string,
): string {
  const dateLabel = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${isoDate}T12:00:00`))

  if (value === 0) {
    return `${dateLabel} — без активности`
  }
  if (valueLabel?.trim()) {
    return `${dateLabel} — ${value} (${valueLabel.trim()})`
  }
  return `${dateLabel} — значение: ${value}`
}

export function DeedActivityHeatmap({
  activity,
  valueLabel,
  cardColor,
  showWeekdayLabels = true,
  showMonthLabels = true,
  showPeakAndLegend = true,
}: DeedActivityHeatmapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [visibleWeeks, setVisibleWeeks] = useState(13)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const updateVisibleWeeks = () => {
      const width = node.clientWidth
      if (width > 0)
        setVisibleWeeks(getHeatmapVisibleWeeks(width, showWeekdayLabels))
    }

    updateVisibleWeeks()

    const observer = new ResizeObserver(() => updateVisibleWeeks())
    observer.observe(node)
    return () => observer.disconnect()
  }, [showWeekdayLabels])

  const heatmap = buildDeedHeatmap(activity, visibleWeeks)
  const weekCount = heatmap.requestedWeeks
  const monthLabelsShown = monthLabelsSkipCrampedLeft(
    heatmap.monthLabels,
    weekCount,
  )

  const heatmapBoxClass = [
    styles.heatmap,
    !showMonthLabels ? styles.heatmapNoMonthLabels : '',
  ]
    .filter(Boolean)
    .join(' ')

  const weekdayColClass = [
    styles.weekdayLabels,
    !showMonthLabels ? styles.weekdayLabelsFlushTop : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Card style={{ flex: '1' }}>
      <Box
        ref={containerRef}
        className={styles.layoutVars}
        style={heatmapAccentStyle(cardColor)}
      >
        <Flex direction="column" gap="1" mb={showPeakAndLegend ? '4' : '2'}>
          <Text size="2" color="gray">
            Активность
          </Text>

          <Flex align="start" gap="2">
            {showWeekdayLabels ? (
              <Box className={weekdayColClass} aria-hidden="true">
                {WEEKDAY_LABELS.map((label, index) => (
                  <Text
                    key={`wd-${index}`}
                    as="span"
                    size="1"
                    color="gray"
                    className={label ? '' : styles.weekdayLabelBlank}
                  >
                    {label || '·'}
                  </Text>
                ))}
              </Box>
            ) : null}

            <Box className={heatmapBoxClass}>
              {showMonthLabels ? (
                <Box
                  className={styles.monthLabels}
                  aria-hidden="true"
                  style={{
                    gridTemplateColumns: `repeat(${weekCount}, ${HEATMAP_CELL_PX}px)`,
                  }}
                >
                  {monthLabelsShown.map((label, index) => (
                    <Box
                      key={label.key}
                      className={[
                        styles.monthLabelWrap,
                        index === monthLabelsShown.length - 1
                          ? styles.monthLabelEnd
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{ gridColumnStart: `${label.weekIndex + 1}` }}
                    >
                      <Text as="span" size="1" color="gray">
                        {label.label}
                      </Text>
                    </Box>
                  ))}
                </Box>
              ) : null}

              <Box
                className={styles.grid}
                style={{
                  gridTemplateColumns: `repeat(${weekCount}, ${HEATMAP_CELL_PX}px)`,
                }}
              >
                {heatmap.cells.map((cell) => {
                  const levelClass =
                    cell.level >= 1 && cell.level <= 4
                      ? LEVEL_CLASSES[cell.level - 1]
                      : ''
                  const className = [
                    styles.cell,
                    cell.isFuture ? styles.cellFuture : '',
                    !cell.isFuture ? levelClass : '',
                    cell.isToday ? styles.today : '',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  const tip = formatHeatmapDateLabel(
                    cell.date,
                    cell.value,
                    valueLabel,
                  )

                  if (cell.isFuture) {
                    return (
                      <Box
                        key={cell.date}
                        className={className}
                        aria-hidden
                      />
                    )
                  }

                  return (
                    <Tooltip
                      key={cell.date}
                      content={tip}
                      delayDuration={400}
                    >
                      <Box className={className} aria-label={tip} />
                    </Tooltip>
                  )
                })}
              </Box>
            </Box>
          </Flex>
        </Flex>

        {showPeakAndLegend ? (
          <Flex align="center" justify="between" mt="2">
            <Flex direction="row" gap="1">
              <Text size="2" color="gray">пик:</Text>
              <Text size="2">{heatmap.maxCount}</Text>
            </Flex>

            <Flex align="center" gap="1" aria-hidden="true">
              <Text as="span" size="1" color="gray">
                Меньше
              </Text>
              <Box className={styles.cell} />
              <Box className={`${styles.cell} ${styles.level1}`} />
              <Box className={`${styles.cell} ${styles.level2}`} />
              <Box className={`${styles.cell} ${styles.level3}`} />
              <Box className={`${styles.cell} ${styles.level4}`} />
              <Text as="span" size="1" color="gray">
                Больше
              </Text>
            </Flex>
          </Flex>
        ) : null}
      </Box>
    </Card>
  )
}
