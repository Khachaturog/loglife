/**
 * Пресеты «шаг 9» палитр Radix Themes (@radix-ui/themes/tokens/colors/*.css),
 * sRGB-значения из светлой ветки (:root / первая декларация --*-9).
 * Используются для выбора `deeds.card_color` (hex) в форме дела.
 */
export type RadixColor9Preset = {
  /** Стабильный id для Select (совпадает с именем шкалы в Radix) */
  id: string
  /** Подпись в UI (русские названия оттенков) */
  label: string
  hex: string
}

/**
 * Все шкалы из пакета @radix-ui/themes/tokens/colors, шаг 9.
 * Порядок: по алфавиту русских подписей.
 */
export const RADIX_COLOR_9_PRESETS: RadixColor9Preset[] = [
  { id: 'cyan', label: 'Бирюзовый', hex: '#00a2c7' },
  { id: 'bronze', label: 'Бронзовый', hex: '#a18072' },
  { id: 'yellow', label: 'Жёлтый', hex: '#ffe629' },
  { id: 'green', label: 'Зелёный', hex: '#30a46c' },
  { id: 'gold', label: 'Золотистый', hex: '#978365' },
  { id: 'indigo', label: 'Индиго', hex: '#3e63dd' },
  { id: 'iris', label: 'Ирис', hex: '#5b5bd6' },
  { id: 'brown', label: 'Коричневый', hex: '#ad7f58' },
  { id: 'red', label: 'Красный', hex: '#e5484d' },
  { id: 'lime', label: 'Лайм', hex: '#bdee63' },
  { id: 'mauve', label: 'Лиловый', hex: '#8e8c99' },
  { id: 'crimson', label: 'Малиновый', hex: '#e93d82' },
  { id: 'teal', label: 'Морской', hex: '#12a594' },
  { id: 'mint', label: 'Мятный', hex: '#86ead4' },
  { id: 'sky', label: 'Небесный', hex: '#7ce2fe' },
  { id: 'jade', label: 'Нефритовый', hex: '#29a383' },
  { id: 'olive', label: 'Оливковый', hex: '#898e87' },
  { id: 'orange', label: 'Оранжевый', hex: '#f76b15' },
  { id: 'sand', label: 'Песочный', hex: '#8d8d86' },
  { id: 'purple', label: 'Пурпурный', hex: '#8e4ec6' },
  { id: 'pink', label: 'Розовый', hex: '#d6409f' },
  { id: 'ruby', label: 'Рубиновый', hex: '#e54666' },
  { id: 'gray', label: 'Серый', hex: '#8d8d8d' },
  { id: 'blue', label: 'Синий', hex: '#0090ff' },
  { id: 'slate', label: 'Сланцевый', hex: '#8b8d98' },
  { id: 'plum', label: 'Сливовый', hex: '#ab4aba' },
  { id: 'tomato', label: 'Томатный', hex: '#e54d2e' },
  { id: 'grass', label: 'Травяной', hex: '#46a758' },
  { id: 'violet', label: 'Фиолетовый', hex: '#6e56cf' },
  { id: 'sage', label: 'Шалфей', hex: '#868e8b' },
  { id: 'amber', label: 'Янтарный', hex: '#ffc53d' },
]

export function findRadixColor9PresetByHex(
  hex: string,
): RadixColor9Preset | undefined {
  const n = hex.trim().toLowerCase()
  if (!n) return undefined
  return RADIX_COLOR_9_PRESETS.find((p) => p.hex.toLowerCase() === n)
}
