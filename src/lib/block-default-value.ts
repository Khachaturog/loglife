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
 * Для «Число»: любое конечное значение, кроме 0 (ноль не считаем валидным дефолтом, как «пусто» на форме); дроби не округляем.
 * Для «Текст»: пустой/пробельный ввод — `null`, если блок обязательный; иначе `{ text: '' }`.
 */
export function normalizeDefaultValueForBlock(
  block: Pick<BlockRow, 'block_type' | 'config'> & { is_required?: boolean },
  raw: unknown,
): ValueJson | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null

  const t = block.block_type
  const required = block.is_required !== false

  if (t === 'number') {
    const n = (raw as { number?: unknown }).number
    if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) return null
    return { number: n }
  }

  if (t === 'text_paragraph') {
    const text = (raw as { text?: unknown }).text
    if (typeof text !== 'string') return null
    const trimmed = text.trim()
    if (trimmed === '') return required ? null : { text: '' }
    return { text: trimmed }
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

/**
 * Payload ответов записи: не передаём на сервер необязательный текст с пустым содержимым
 * (нет строки в `record_answers` — в просмотре показывается «Не заполнено» / приглашение дописать).
 */
export function omitOptionalEmptyTextFromRecordAnswers(
  blocks: Pick<BlockRow, 'id' | 'block_type' | 'is_required'>[],
  answers: Record<string, ValueJson>,
): Record<string, ValueJson> {
  const byId = new Map(blocks.filter((b) => b.id).map((b) => [b.id!, b]))
  const out: Record<string, ValueJson> = {}
  for (const [id, v] of Object.entries(answers)) {
    const b = byId.get(id)
    if (
      b?.block_type === 'text_paragraph' &&
      b.is_required === false &&
      'text' in v &&
      String((v as { text?: string }).text ?? '').trim() === ''
    ) {
      continue
    }
    out[id] = v
  }
  return out
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
    if (!normalized) continue
    if (
      b.block_type === 'text_paragraph' &&
      b.is_required === false &&
      'text' in normalized &&
      String((normalized as { text: string }).text ?? '').trim() === ''
    ) {
      continue
    }
    out[b.id] = normalized
  }
  return out
}

/** Активные блоки дела (не удалённые), по порядку. */
export function activeBlocksSorted(blocks: BlockRow[] | undefined): BlockRow[] {
  return (blocks ?? [])
    .filter((b) => !b.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order)
}

/**
 * Полный набор ответов из дефолтов блоков для быстрого создания записи.
 * Если у хотя бы одного активного блока нет валидного дефолта — `null`.
 */
export function getCompleteDefaultAnswers(blocks: BlockRow[] | undefined): Record<string, ValueJson> | null {
  const list = activeBlocksSorted(blocks)
  if (list.length === 0) return null
  const out: Record<string, ValueJson> = {}
  for (const b of list) {
    if (!b.id) return null
    if (!b.default_value_enabled) return null
    const normalized = normalizeDefaultValueForBlock(b, b.default_value)
    if (!normalized) return null
    if (
      b.block_type === 'text_paragraph' &&
      b.is_required === false &&
      'text' in normalized &&
      String((normalized as { text: string }).text ?? '').trim() === ''
    ) {
      continue
    }
    out[b.id] = normalized
  }
  return out
}

export function isQuickAddDefaultsAvailable(blocks: BlockRow[] | undefined): boolean {
  return getCompleteDefaultAnswers(blocks) !== null
}

/**
 * Все блоки (в порядке формы) имеют включённый и валидный дефолт — можно включать «быстрое добавление» в редакторе.
 * Не требует `id` блока (подходит для черновика до первого сохранения).
 */
export function areDefaultValuesCompleteForBlocks(
  blocks:
    | Array<
        Pick<BlockRow, 'block_type' | 'config' | 'default_value_enabled' | 'default_value'> & {
          is_required?: boolean
          deleted_at?: string | null
        }
      >
    | undefined,
): boolean {
  const list = (blocks ?? []).filter((b) => !b.deleted_at)
  if (list.length === 0) return false
  for (const b of list) {
    if (!b.default_value_enabled) return false
    if (!normalizeDefaultValueForBlock(b, b.default_value)) return false
  }
  return true
}
