/**
 * Каталог единиц блока «Число»: коды в `blocks.config.unit`, подписи для экрана.
 * Смена единицы не пересчитывает сохранённые ответы — только формат показа.
 */
import type { BlockConfig, MeasurementUnit, MeasurementUnitCode } from '@/types/database'

/** Своё название после обрезки пробелов. */
export const MEASUREMENT_UNIT_CUSTOM_LABEL_MAX = 24
/** Сокращение своего названия. Пустое в базу не пишется. */
export const MEASUREMENT_UNIT_CUSTOM_SHORT_MAX = 8

type PresetMeta = {
  title: string
  /** Знак в выпадающем списке не используется. У валют подпись числа берётся из `short`. */
  symbol: string
  /** Текстовое сокращение валюты: справа в поле и в подписи числа. */
  short?: string
}

export const MEASUREMENT_UNIT_PRESET_BY_CODE: Record<MeasurementUnitCode, PresetMeta> = {
  percent: { title: 'Проценты', symbol: '%' },
  rub: { title: 'Российский рубль', symbol: '₽', short: 'руб' },
  usd: { title: 'Доллар США', symbol: '$', short: 'долл' },
  eur: { title: 'Евро', symbol: '€', short: 'евро' },
  gbp: { title: 'Фунт стерлингов', symbol: '£', short: 'ф.ст' },
  cny: { title: 'Китайский юань', symbol: '¥', short: 'юань' },
  jpy: { title: 'Японская йена', symbol: '¥', short: 'иена' },
  inr: { title: 'Индийская рупия', symbol: '₹', short: 'рупия' },
  kzt: { title: 'Казахстанский тенге', symbol: '₸', short: 'тенге' },
  try: { title: 'Турецкая лира', symbol: '₺', short: 'лира' },
  byn: { title: 'Белорусский рубль', symbol: 'Br', short: 'б.руб' },
  amd: { title: 'Армянский драм', symbol: '֏', short: 'драм' },
  gel: { title: 'Грузинский лари', symbol: '₾', short: 'лари' },
  btc: { title: 'Биткоин', symbol: '₿', short: 'бит' },
  hour: { title: 'Часы', symbol: 'ч' },
  minute: { title: 'Минуты', symbol: 'мин' },
  second: { title: 'Секунды', symbol: 'с' },
  km: { title: 'Километры', symbol: 'км' },
  m: { title: 'Метры', symbol: 'м' },
  mi: { title: 'Мили', symbol: 'ми' },
  ft: { title: 'Футы', symbol: 'фут' },
  yd: { title: 'Ярды', symbol: 'ярд' },
  l: { title: 'Литры', symbol: 'л' },
  ml: { title: 'Миллилитры', symbol: 'мл' },
  gal: { title: 'Галлоны', symbol: 'гал' },
  fl_oz: { title: 'Жидкие унции', symbol: 'fl oz' },
  kg: { title: 'Килограммы', symbol: 'кг' },
  g: { title: 'Граммы', symbol: 'г' },
  mg: { title: 'Миллиграммы', symbol: 'мг' },
  lb: { title: 'Фунты', symbol: 'фунт' },
  oz: { title: 'Унции', symbol: 'oz' },
  kcal: { title: 'Калории', symbol: 'ккал' },
}

/** Валюты: в списке в скобках международный код, не символ. */
const CURRENCY_CODES = new Set<MeasurementUnitCode>([
  'rub',
  'usd',
  'eur',
  'gbp',
  'cny',
  'jpy',
  'inr',
  'kzt',
  'try',
  'byn',
  'amd',
  'gel',
  'btc',
])

/** Порядок групп и кодов в выпадающем списке. Валюта — перед «Свой вариант». */
export const MEASUREMENT_UNIT_PICKER_GROUPS: {
  id: string
  title: string
  sections: { title?: string; codes: MeasurementUnitCode[] }[]
}[] = [
  { id: 'misc', title: 'Разное', sections: [{ codes: ['percent'] }] },
  { id: 'duration', title: 'Продолжительность', sections: [{ codes: ['hour', 'minute', 'second'] }] },
  { id: 'distance', title: 'Расстояние', sections: [{ codes: ['km', 'm', 'mi', 'ft', 'yd'] }] },
  { id: 'volume', title: 'Объём', sections: [{ codes: ['l', 'ml', 'gal', 'fl_oz'] }] },
  { id: 'mass', title: 'Масса', sections: [{ codes: ['kg', 'g', 'mg', 'lb', 'oz'] }] },
  { id: 'energy', title: 'Энергия', sections: [{ codes: ['kcal'] }] },
  {
    id: 'money',
    title: 'Валюта',
    sections: [{ codes: ['rub', 'usd', 'eur', 'gbp', 'cny', 'jpy', 'inr', 'kzt', 'try', 'byn', 'amd', 'gel', 'btc'] }],
  },
]

/** Текст в скобках пункта списка: у валюты код (RUB), у остальных символ (кг). */
export function measurementUnitListSuffix(code: MeasurementUnitCode): string {
  if (CURRENCY_CODES.has(code)) return code.toUpperCase()
  return MEASUREMENT_UNIT_PRESET_BY_CODE[code].symbol
}

const PRESET_CODES = new Set<string>(Object.keys(MEASUREMENT_UNIT_PRESET_BY_CODE))

function isPresetCode(code: string): code is MeasurementUnitCode {
  return PRESET_CODES.has(code)
}

/** Обрезать своё название и привести к нижнему регистру. Пустая строка — единицы нет. */
export function normalizeCustomUnitLabel(raw: string): string {
  return raw.trim().toLocaleLowerCase('ru').slice(0, MEASUREMENT_UNIT_CUSTOM_LABEL_MAX)
}

/** Обрезать сокращение и привести к нижнему регистру. Пустая строка — сокращения нет. */
export function normalizeCustomUnitShort(raw: string): string {
  return raw.trim().toLocaleLowerCase('ru').slice(0, MEASUREMENT_UNIT_CUSTOM_SHORT_MAX)
}

/** Прочитать единицу из jsonb. Неизвестный код и пустой custom игнорируются. */
export function readMeasurementUnit(config: BlockConfig | null | undefined): MeasurementUnit | null {
  const raw = config?.unit
  if (!raw || typeof raw !== 'object') return null
  if (raw.kind === 'preset' && typeof raw.code === 'string' && isPresetCode(raw.code)) {
    return { kind: 'preset', code: raw.code }
  }
  if (raw.kind === 'custom' && typeof raw.label === 'string') {
    const label = normalizeCustomUnitLabel(raw.label)
    if (!label) return null
    const short = typeof raw.short === 'string' ? normalizeCustomUnitShort(raw.short) : ''
    return short ? { kind: 'custom', label, short } : { kind: 'custom', label }
  }
  return null
}

/** Записать единицу в config, не трогая остальные ключи. Без единицы ключ `unit` снимается. */
export function configWithMeasurementUnit(
  config: BlockConfig | null,
  unit: MeasurementUnit | null,
): BlockConfig | null {
  const next: BlockConfig = { ...(config ?? {}) }
  const normalized = readMeasurementUnit(unit ? { unit } : null)
  if (normalized) next.unit = normalized
  else delete next.unit
  return Object.keys(next).length > 0 ? next : null
}

/**
 * Подпись числа: у валюты текстовое сокращение (`руб`), у остальных символ (`кг`),
 * у своего варианта — своё сокращение.
 */
export function measurementUnitSymbol(unit: MeasurementUnit | null): string {
  if (!unit) return ''
  if (unit.kind === 'custom') return unit.short || unit.label
  const meta = MEASUREMENT_UNIT_PRESET_BY_CODE[unit.code]
  return meta.short ?? meta.symbol
}

/** Справа в поле числа — та же подпись, что у сохранённого числа. */
export function measurementUnitInputSuffix(unit: MeasurementUnit | null): string {
  return measurementUnitSymbol(unit)
}

/** Подпись кнопки в редакторе дела. */
export function measurementUnitTitle(unit: MeasurementUnit | null): string {
  if (!unit) return 'Нет единицы'
  if (unit.kind === 'custom') return unit.label
  return MEASUREMENT_UNIT_PRESET_BY_CODE[unit.code].title
}

/**
 * Число как есть, затем символ.
 * Проценты без пробела (`80%`), остальное через пробел (`72.5 кг`).
 */
export function formatNumberWithUnit(value: number | string, unit: MeasurementUnit | null): string {
  const num = typeof value === 'number' ? String(value) : value
  const symbol = measurementUnitSymbol(unit)
  if (!symbol) return num
  if (unit?.kind === 'preset' && unit.code === 'percent') return `${num}${symbol}`
  return `${num} ${symbol}`
}

/** Хвост к уже отрисованному числу: `%` или ` кг`. Пусто, если единицы нет. */
export function measurementUnitTail(unit: MeasurementUnit | null): string {
  return formatNumberWithUnit('', unit)
}

/** Часы/минуты/секунды из диалога «Время → Число» → пресет единицы. */
export function measurementUnitFromDurationNumber(unit: 'hours' | 'minutes' | 'seconds'): MeasurementUnit {
  if (unit === 'hours') return { kind: 'preset', code: 'hour' }
  if (unit === 'seconds') return { kind: 'preset', code: 'second' }
  return { kind: 'preset', code: 'minute' }
}

/**
 * Единица сводки на карточке дела: только когда на экране сумма одного блока «Число».
 * Несколько числовых блоков или «Время» — это счётчик записей, без символа.
 */
export function singleNumberBlockSummaryUnit(
  blocks: { block_type: string; config: BlockConfig | null }[],
): MeasurementUnit | null {
  const numeric = blocks.filter(
    (b) => b.block_type === 'number' || b.block_type === 'scale' || b.block_type === 'duration',
  )
  if (numeric.length !== 1 || numeric[0].block_type !== 'number') return null
  return readMeasurementUnit(numeric[0].config)
}
