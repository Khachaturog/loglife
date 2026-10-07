/**
 * Превью и MVP-конвертация ответов при смене типа блока (модалка в DeedFormPage).
 * Целевые типы single/multi/scale/duration/yes_no как приёмник — вне MVP: ответы не трогаем.
 * «Ссылка URL» ↔ «Текст»: строка копируется как есть. В ссылку из других типов автопереноса нет.
 */
import { formatAnswer } from '@/lib/format-utils'
import type { BlockConfig, BlockRow, BlockType, RecordAnswerRow, RecordRow, ValueJson } from '@/types/database'

/** UiBlock из формы дела → BlockRow для formatAnswer / API (временные поля даты — заглушки). */
export function blockRowFromUiForApi(
  ui: {
    id: string
    title: string
    block_type: BlockType
    is_required: boolean
    recent_suggestions_enabled: boolean
    default_value_enabled: boolean
    default_value: ValueJson | null
    config: BlockConfig | null
  },
  deedId: string,
  sortOrder: number,
): BlockRow {
  return {
    id: ui.id,
    deed_id: deedId,
    sort_order: sortOrder,
    title: ui.title,
    block_type: ui.block_type,
    is_required: ui.is_required,
    default_value: ui.default_value,
    default_value_enabled: ui.default_value_enabled,
    recent_suggestions_enabled: ui.recent_suggestions_enabled,
    config: ui.config,
    deleted_at: null,
    created_at: '1970-01-01T00:00:00Z',
    updated_at: '1970-01-01T00:00:00Z',
  }
}

export type DurationNumberUnit = 'seconds' | 'minutes' | 'hours'

/** Заблокированные пары (продукт: «абсурд»). */
export function isBlockedTypeTransition(fromType: BlockType, toType: BlockType): boolean {
  if (fromType === 'yes_no' && (toType === 'scale' || toType === 'duration')) return true
  return false
}

/**
 * Автоперенос value_json: в число и текст — из любого типа.
 * В «Ссылку URL» — только из текста (строка копируется как есть).
 */
export function supportsAutomaticAnswerMigration(toType: BlockType, fromType?: BlockType): boolean {
  if (toType === 'number' || toType === 'text_paragraph') return true
  if (toType === 'url') return fromType === 'text_paragraph'
  return false
}

function scaleDivisions(block: Pick<BlockRow, 'config'>): number {
  return Math.min(10, Math.max(1, (block.config as BlockConfig | null)?.divisions ?? 5))
}

/** Секунды из строки ЧЧ:ММ:СС или null. */
export function parseDurationHmsToSeconds(hms: string): number | null {
  const t = hms.trim()
  if (!/^\d{2}:\d{2}:\d{2}$/.test(t)) return null
  const [hh, mm, ss] = t.split(':').map((x) => parseInt(x, 10))
  if (![hh, mm, ss].every((n) => Number.isFinite(n) && n >= 0)) return null
  if (mm > 59 || ss > 59) return null
  return hh * 3600 + mm * 60 + ss
}

/** Первое число в строке (для MVP «число из текста/лейбла»). */
export function extractFirstNumberFromString(s: string): number | null {
  const m = s.match(/-?\d+(?:[.,]\d+)?/)
  if (!m) return null
  const n = Number(m[0].replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Соответствует ли JSON ответа ожидаемой форме для текущего block_type.
 * Используется в RecordView для детекции «устарело» при смене типа без миграции.
 */
export function valueJsonMatchesBlockType(
  block: Pick<BlockRow, 'block_type' | 'config'>,
  v: unknown,
): boolean {
  if (v === null || v === undefined) return false
  if (typeof v !== 'object' || Array.isArray(v)) return false
  const o = v as Record<string, unknown>
  switch (block.block_type) {
    case 'number':
      return 'number' in o && typeof o.number === 'number' && Number.isFinite(o.number)
    case 'text_paragraph':
      return 'text' in o && typeof o.text === 'string'
    case 'single_select':
      return typeof o.optionId === 'string' && o.optionId.length > 0
    case 'multi_select':
      return (
        Array.isArray(o.optionIds) &&
        o.optionIds.length > 0 &&
        o.optionIds.every((x) => typeof x === 'string')
      )
    case 'scale':
      return typeof o.scaleValue === 'number' && Number.isFinite(o.scaleValue)
    case 'yes_no':
      return typeof o.yesNo === 'boolean'
    case 'duration':
      return typeof o.durationHms === 'string'
    case 'url':
      return typeof o.url === 'string'
    default:
      return false
  }
}

function meaningString(value: ValueJson, sourceBlock: BlockRow): string {
  const s = formatAnswer(value, sourceBlock)
  return s === '—' ? '' : s
}

export type MvpMigrationResult = {
  /** null — не обновлять ответ в БД (оставить для ручной актуализации). */
  newValue: ValueJson | null
  /** Подпись колонки «Стало» в модалке. */
  afterLabel: string
}

/**
 * MVP-правила: цель number | text_paragraph, плюс text_paragraph → url.
 * Для duration→number нужен выбор единицы (секунды из строки → деление).
 */
export function migrateValueMvp(params: {
  value: ValueJson
  fromType: BlockType
  toType: BlockType
  /** Блок как до смены типа (совпадает с fromType и shape value). */
  sourceBlock: BlockRow
  durationNumberUnit?: DurationNumberUnit
}): MvpMigrationResult {
  const { value, fromType, toType, sourceBlock, durationNumberUnit = 'minutes' } = params

  if (toType === 'text_paragraph') {
    if (fromType === 'scale' && 'scaleValue' in value) {
      const n = Math.floor(Number((value as { scaleValue: number }).scaleValue))
      const m = scaleDivisions(sourceBlock)
      const label = n >= 1 && n <= m ? `${n} из ${m}` : meaningString(value, sourceBlock)
      return { newValue: { text: label || '' }, afterLabel: label || '—' }
    }
    if (fromType === 'yes_no' && 'yesNo' in value) {
      const yn = (value as { yesNo: boolean }).yesNo
      const t = yn ? 'да' : 'нет'
      return { newValue: { text: t }, afterLabel: t }
    }
    if (fromType === 'duration' && 'durationHms' in value) {
      const hms = (value as { durationHms: string }).durationHms
      return { newValue: { text: hms }, afterLabel: hms || '—' }
    }
    // Ссылка URL → текст: адрес без преобразований.
    if (fromType === 'url' && 'url' in value) {
      const u = (value as { url: string }).url
      return { newValue: { text: u }, afterLabel: u.trim() === '' ? '—' : u }
    }
    const s = meaningString(value, sourceBlock)
    return { newValue: { text: s }, afterLabel: s || '—' }
  }

  if (toType === 'number') {
    if (fromType === 'number' && 'number' in value) {
      const n = (value as { number: number }).number
      return { newValue: { number: n }, afterLabel: String(n) }
    }
    if (fromType === 'scale' && 'scaleValue' in value) {
      const n = Math.floor(Number((value as { scaleValue: number }).scaleValue))
      if (!Number.isFinite(n)) return { newValue: null, afterLabel: '—' }
      return { newValue: { number: n }, afterLabel: String(n) }
    }
    if (fromType === 'yes_no' && 'yesNo' in value) {
      const n = (value as { yesNo: boolean }).yesNo ? 1 : 0
      return { newValue: { number: n }, afterLabel: String(n) }
    }
    if (fromType === 'duration' && 'durationHms' in value) {
      const sec = parseDurationHmsToSeconds((value as { durationHms: string }).durationHms)
      if (sec === null) {
        const fallback = extractFirstNumberFromString((value as { durationHms: string }).durationHms)
        if (fallback === null) return { newValue: null, afterLabel: '—' }
        return { newValue: { number: fallback }, afterLabel: String(fallback) }
      }
      let n: number
      if (durationNumberUnit === 'hours') n = Math.floor(sec / 3600)
      else if (durationNumberUnit === 'minutes') n = Math.floor(sec / 60)
      else n = sec
      return { newValue: { number: n }, afterLabel: String(n) }
    }
    const s = meaningString(value, sourceBlock)
    const n = extractFirstNumberFromString(s)
    if (n === null) return { newValue: null, afterLabel: '—' }
    return { newValue: { number: n }, afterLabel: String(n) }
  }

  // Текст → ссылка URL: строка без преобразований.
  if (toType === 'url' && fromType === 'text_paragraph' && 'text' in value) {
    const t = (value as { text: string }).text
    return { newValue: { url: t }, afterLabel: t.trim() === '' ? '—' : t }
  }

  return { newValue: null, afterLabel: '—' }
}

export type BlockTypeChangePreviewRow = {
  recordId: string
  recordDate: string
  recordTime: string
  beforeDisplay: string
  afterDisplay: string
  willMigrate: boolean
  newValue: ValueJson | null
}

/** Строки превью для модалки по загруженным записям дела. */
export function buildBlockTypeChangePreviewRows(params: {
  records: (RecordRow & { record_answers?: RecordAnswerRow[] })[]
  blockId: string
  nextType: BlockType
  /** Блок в состоянии до смены типа (совпадает с value_json в ответах). */
  snapshotAsBlockRow: BlockRow
  durationUnit: DurationNumberUnit
}): BlockTypeChangePreviewRow[] {
  const { records, blockId, nextType, snapshotAsBlockRow, durationUnit } = params
  const out: BlockTypeChangePreviewRow[] = []
  const auto = supportsAutomaticAnswerMigration(nextType, snapshotAsBlockRow.block_type)

  for (const rec of records) {
    const ans = rec.record_answers?.find((a) => a.block_id === blockId)
    const beforeDisplay = ans
      ? formatAnswer(ans.value_json as ValueJson, snapshotAsBlockRow)
      : '—'
    if (!ans) {
      out.push({
        recordId: rec.id,
        recordDate: rec.record_date,
        recordTime: rec.record_time,
        beforeDisplay: '—',
        afterDisplay: '—',
        willMigrate: false,
        newValue: null,
      })
      continue
    }
    const value = ans.value_json as ValueJson
    const m = migrateValueMvp({
      value,
      fromType: snapshotAsBlockRow.block_type,
      toType: nextType,
      sourceBlock: snapshotAsBlockRow,
      durationNumberUnit: durationUnit,
    })
    const willMigrate = auto && m.newValue !== null
    out.push({
      recordId: rec.id,
      recordDate: rec.record_date,
      recordTime: rec.record_time,
      beforeDisplay,
      afterDisplay: willMigrate ? m.afterLabel : auto ? 'без изменений (устарело)' : '—',
      willMigrate,
      newValue: m.newValue,
    })
  }
  return out
}
