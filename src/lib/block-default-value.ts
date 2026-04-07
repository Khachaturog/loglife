/**
 * Валидация и подстановка `blocks.default_value` на форме новой записи.
 */
import type { BlockConfig, BlockRow, BlockType, ValueJson } from '@/types/database'

function optionIdsFromBlock(block: Pick<BlockRow, 'config'>): Set<string> {
  const opts = (block.config as BlockConfig | null)?.options ?? []
  return new Set(opts.map((o) => o.id))
}

function scaleDivisions(block: Pick<BlockRow, 'config'>): number {
  return Math.min(10, Math.max(1, (block.config as BlockConfig | null)?.divisions ?? 5))
}

/**
 * Проверяет JSON дефолта на соответствие типу блока и актуальному config.
 * Число 0 не считаем валидным дефолтом (как в FillForm: пусто).
 */
export function normalizeDefaultValueForBlock(
  block: Pick<BlockRow, 'block_type' | 'config'>,
  raw: unknown,
): ValueJson | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null

  const t = block.block_type

  if (t === 'number') {
    const n = (raw as { number?: unknown }).number
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 1) return null
    return { number: Math.floor(n) }
  }

  if (t === 'text_paragraph') {
    const text = (raw as { text?: unknown }).text
    if (typeof text !== 'string' || text.trim() === '') return null
    return { text }
  }

  if (t === 'single_select') {
    const optionId = (raw as { optionId?: unknown }).optionId
    if (typeof optionId !== 'string' || !optionId) return null
    if (!optionIdsFromBlock(block).has(optionId)) return null
    return { optionId }
  }

  if (t === 'multi_select') {
    const optionIds = (raw as { optionIds?: unknown }).optionIds
    if (!Array.isArray(optionIds) || optionIds.length === 0) return null
    const valid = optionIdsFromBlock(block)
    const ids: string[] = []
    for (const id of optionIds) {
      if (typeof id !== 'string' || !valid.has(id)) return null
      ids.push(id)
    }
    return { optionIds: ids }
  }

  if (t === 'scale') {
    const scaleValue = (raw as { scaleValue?: unknown }).scaleValue
    const divs = scaleDivisions(block)
    if (typeof scaleValue !== 'number' || !Number.isFinite(scaleValue)) return null
    const v = Math.floor(scaleValue)
    if (v < 1 || v > divs) return null
    return { scaleValue: v }
  }

  if (t === 'yes_no') {
    const yesNo = (raw as { yesNo?: unknown }).yesNo
    if (typeof yesNo !== 'boolean') return null
    return { yesNo }
  }

  if (t === 'duration') {
    const durationHms = (raw as { durationHms?: unknown }).durationHms
    if (typeof durationHms !== 'string') return null
    if (durationHms.length < 8 || !/^\d{2}:\d{2}:\d{2}$/.test(durationHms)) return null
    return { durationHms }
  }

  return null
}

/** Стартовое значение при включении тоггла «дефолт» в редакторе дела (насколько возможно валидно). */
export function createInitialDefaultForBlockType(
  block_type: BlockType,
  config: BlockConfig | null,
): ValueJson | null {
  switch (block_type) {
    case 'number':
      return { number: 1 }
    case 'text_paragraph':
      return { text: '' }
    case 'single_select': {
      const first = config?.options?.[0]
      return first?.id ? { optionId: first.id } : null
    }
    case 'multi_select': {
      const first = config?.options?.[0]
      return first?.id ? { optionIds: [first.id] } : null
    }
    case 'scale': {
      return { scaleValue: 1 }
    }
    case 'yes_no':
      return { yesNo: false }
    case 'duration':
      return { durationHms: '00:00:00' }
    default:
      return null
  }
}

/**
 * Мерж дефолтов в состояние ответов: только при `default_value_enabled` и валидном JSON, без перезаписи существующих ключей.
 */
export function initialAnswersFromBlockDefaults(
  blocks: BlockRow[],
  existingKeys: Set<string>,
): Record<string, ValueJson> {
  const out: Record<string, ValueJson> = {}
  for (const b of blocks) {
    if (!b.id || existingKeys.has(b.id)) continue
    if (!b.default_value_enabled) continue
    const normalized = normalizeDefaultValueForBlock(b, b.default_value)
    if (normalized) out[b.id] = normalized
  }
  return out
}
