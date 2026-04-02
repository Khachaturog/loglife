import type { BlockRow } from '@/types/database'
import type { DeedAnalyticsConfigV1 } from '@/types/deed-analytics-config'
import { DEFAULT_DEED_ANALYTICS_CONFIG } from '@/types/deed-analytics-config'

export type { DeedAnalyticsConfigV1 } from '@/types/deed-analytics-config'
export { DEFAULT_DEED_ANALYTICS_CONFIG } from '@/types/deed-analytics-config'

function isObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x)
}

/** Сливает сырой JSON из БД с дефолтами (частичные объекты и старые версии). */
export function normalizeDeedAnalyticsConfig(raw: unknown): DeedAnalyticsConfigV1 {
  if (!isObject(raw) || raw.version !== 1) return { ...DEFAULT_DEED_ANALYTICS_CONFIG }
  const s = isObject(raw.summary) ? raw.summary : {}
  const a = isObject(raw.activity) ? raw.activity : {}
  const h = isObject(raw.heatmap) ? raw.heatmap : {}
  return {
    version: 1,
    summary: {
      enabled: typeof s.enabled === 'boolean' ? s.enabled : DEFAULT_DEED_ANALYTICS_CONFIG.summary.enabled,
      block_id: typeof s.block_id === 'string' ? s.block_id : s.block_id === null ? null : DEFAULT_DEED_ANALYTICS_CONFIG.summary.block_id,
      show_today: typeof s.show_today === 'boolean' ? s.show_today : DEFAULT_DEED_ANALYTICS_CONFIG.summary.show_today,
      show_month: typeof s.show_month === 'boolean' ? s.show_month : DEFAULT_DEED_ANALYTICS_CONFIG.summary.show_month,
      show_total: typeof s.show_total === 'boolean' ? s.show_total : DEFAULT_DEED_ANALYTICS_CONFIG.summary.show_total,
    },
    activity: {
      enabled: typeof a.enabled === 'boolean' ? a.enabled : DEFAULT_DEED_ANALYTICS_CONFIG.activity.enabled,
      streak_enabled: typeof a.streak_enabled === 'boolean' ? a.streak_enabled : DEFAULT_DEED_ANALYTICS_CONFIG.activity.streak_enabled,
      max_streak_enabled:
        typeof a.max_streak_enabled === 'boolean' ? a.max_streak_enabled : DEFAULT_DEED_ANALYTICS_CONFIG.activity.max_streak_enabled,
      record_count_enabled:
        typeof a.record_count_enabled === 'boolean' ? a.record_count_enabled : DEFAULT_DEED_ANALYTICS_CONFIG.activity.record_count_enabled,
      workday_weekend_enabled:
        typeof a.workday_weekend_enabled === 'boolean'
          ? a.workday_weekend_enabled
          : DEFAULT_DEED_ANALYTICS_CONFIG.activity.workday_weekend_enabled,
    },
    heatmap: {
      enabled: typeof h.enabled === 'boolean' ? h.enabled : DEFAULT_DEED_ANALYTICS_CONFIG.heatmap.enabled,
      block_id: typeof h.block_id === 'string' ? h.block_id : h.block_id === null ? null : DEFAULT_DEED_ANALYTICS_CONFIG.heatmap.block_id,
      use_card_color:
        typeof h.use_card_color === 'boolean' ? h.use_card_color : DEFAULT_DEED_ANALYTICS_CONFIG.heatmap.use_card_color,
      accent_hex: typeof h.accent_hex === 'string' ? h.accent_hex : h.accent_hex === null ? null : DEFAULT_DEED_ANALYTICS_CONFIG.heatmap.accent_hex,
      show_weekday_labels:
        typeof h.show_weekday_labels === 'boolean' ? h.show_weekday_labels : DEFAULT_DEED_ANALYTICS_CONFIG.heatmap.show_weekday_labels,
      show_month_labels:
        typeof h.show_month_labels === 'boolean' ? h.show_month_labels : DEFAULT_DEED_ANALYTICS_CONFIG.heatmap.show_month_labels,
      show_peak_and_legend:
        typeof h.show_peak_and_legend === 'boolean'
          ? h.show_peak_and_legend
          : DEFAULT_DEED_ANALYTICS_CONFIG.heatmap.show_peak_and_legend,
    },
  }
}

/** Активные числовые блоки (без soft-deleted) по sort_order. */
export function listNumericBlocks(blocks: BlockRow[]): BlockRow[] {
  return blocks
    .filter((b) => !b.deleted_at && (b.block_type === 'number' || b.block_type === 'scale' || b.block_type === 'duration'))
    .sort((a, b) => a.sort_order - b.sort_order)
}

/** Выбор блока для сводки/heatmap: явный id или первый подходящий. */
export function resolveNumericBlockByConfigId(blocks: BlockRow[], blockId: string | null): BlockRow | null {
  const list = listNumericBlocks(blocks)
  if (blockId) {
    const found = list.find((b) => b.id === blockId)
    if (found) return found
  }
  return list[0] ?? null
}

/** Значение из value_json для числовых типов (как на экране дела). */
export function getNumericValueFromAnswer(
  valueJson: unknown,
  blockType: 'number' | 'scale' | 'duration',
): number {
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

export function getRecordAnswerNumericValue(
  record: { record_answers?: { block_id: string; value_json: unknown }[] },
  block: BlockRow,
): number {
  const answer = record.record_answers?.find((a) => a.block_id === block.id)
  return getNumericValueFromAnswer(answer?.value_json, block.block_type as 'number' | 'scale' | 'duration')
}

/** Цвет ячеек heatmap: карточка дела или свой hex. */
export function heatmapDisplayColor(
  deedCardColor: string | null | undefined,
  heatmap: DeedAnalyticsConfigV1['heatmap'],
): string | null | undefined {
  if (!heatmap.enabled) return undefined
  if (heatmap.use_card_color) {
    const c = deedCardColor?.trim()
    return c && /^#[0-9A-Fa-f]{6}$/.test(c) ? c : undefined
  }
  const h = heatmap.accent_hex?.trim()
  return h && /^#[0-9A-Fa-f]{6}$/.test(h) ? h : undefined
}
