/**
 * Единица числового блока: выпадающий список с иконками.
 * «Свой вариант» в группе «Другое» открывает поле названия под селектом.
 */
import { Fragment, useEffect, useRef, useState } from 'react'
import { Flex, Select, Text, TextField, Tooltip } from '@radix-ui/themes'
import {
  ArmenianDram,
  Banknote,
  BelarusianRuble,
  Bitcoin,
  CircleOff,
  Clock,
  DollarSign,
  Droplet,
  Dumbbell,
  Euro,
  Flame,
  Footprints,
  Fuel,
  Gauge,
  GeorgianLari,
  GlassWater,
  Hourglass,
  IndianRupee,
  Info,
  JapaneseYen,
  KazakhTenge,
  Milk,
  MoveHorizontal,
  Pencil,
  Percent,
  Pill,
  PoundSterling,
  Route,
  Ruler,
  RussianRuble,
  Scale,
  Signpost,
  Timer,
  TurkishLira,
  Weight,
  type LucideIcon,
} from 'lucide-react'
import {
  MEASUREMENT_UNIT_CUSTOM_LABEL_MAX,
  MEASUREMENT_UNIT_CUSTOM_SHORT_MAX,
  MEASUREMENT_UNIT_PICKER_GROUPS,
  MEASUREMENT_UNIT_PRESET_BY_CODE,
  configWithMeasurementUnit,
  measurementUnitInputSuffix,
  measurementUnitListSuffix,
  measurementUnitTitle,
  normalizeCustomUnitShort,
  normalizeCustomUnitLabel,
  readMeasurementUnit,
} from '@/lib/measurement-unit'
import type { BlockConfig, MeasurementUnit, MeasurementUnitCode } from '@/types/database'

const NONE_VALUE = '__none__'
const CUSTOM_VALUE = '__custom__'

const PRESET_ICONS: Record<MeasurementUnitCode, LucideIcon> = {
  percent: Percent,
  rub: RussianRuble,
  usd: DollarSign,
  eur: Euro,
  gbp: PoundSterling,
  cny: Banknote,
  jpy: JapaneseYen,
  inr: IndianRupee,
  kzt: KazakhTenge,
  try: TurkishLira,
  byn: BelarusianRuble,
  amd: ArmenianDram,
  gel: GeorgianLari,
  btc: Bitcoin,
  hour: Clock,
  minute: Timer,
  second: Hourglass,
  km: Route,
  m: Ruler,
  mi: Signpost,
  ft: Footprints,
  yd: MoveHorizontal,
  l: Milk,
  ml: Droplet,
  gal: Fuel,
  fl_oz: GlassWater,
  kg: Weight,
  g: Scale,
  mg: Pill,
  lb: Dumbbell,
  oz: Gauge,
  kcal: Flame,
}

type Props = {
  config: BlockConfig | null
  onConfigChange: (config: BlockConfig | null) => void
  /** Класс меню Select, чтобы длинный список не вылезал за экран. */
  contentClassName?: string
}

export function NumberUnitField({ config, onConfigChange, contentClassName }: Props) {
  const unit = readMeasurementUnit(config)
  const unitKey =
    unit == null
      ? 'none'
      : unit.kind === 'preset'
        ? `preset:${unit.code}`
        : `custom:${unit.label}\u0000${unit.short ?? ''}`

  const [customDraft, setCustomDraft] = useState(unit?.kind === 'custom' ? unit.label : '')
  const [shortDraft, setShortDraft] = useState(unit?.kind === 'custom' ? (unit.short ?? '') : '')
  // Поле своего названия видно, даже пока подпись пустая и в config единицы ещё нет.
  const [customChosen, setCustomChosen] = useState(unit?.kind === 'custom')
  const skipExternalSync = useRef(false)

  // Смена единицы снаружи (загрузка дела, конвертация времени) подхватывается в селект.
  useEffect(() => {
    if (skipExternalSync.current) {
      skipExternalSync.current = false
      return
    }
    if (unitKey.startsWith('custom:')) {
      const [label, short = ''] = unitKey.slice('custom:'.length).split('\u0000')
      setCustomChosen(true)
      setCustomDraft(label)
      setShortDraft(short)
      return
    }
    if (unitKey.startsWith('preset:')) setCustomChosen(false)
  }, [unitKey])

  const selectValue = customChosen
    ? CUSTOM_VALUE
    : unit?.kind === 'preset'
      ? unit.code
      : NONE_VALUE

  function writeCustom(labelRaw: string, shortRaw: string) {
    const label = normalizeCustomUnitLabel(labelRaw)
    const short = normalizeCustomUnitShort(shortRaw)
    onConfigChange(
      configWithMeasurementUnit(
        config,
        label ? { kind: 'custom', label, ...(short ? { short } : {}) } : null,
      ),
    )
  }

  function onSelect(value: string) {
    if (value === CUSTOM_VALUE) {
      setCustomChosen(true)
      writeCustom(customDraft, shortDraft)
      return
    }
    setCustomChosen(false)
    if (value === NONE_VALUE) {
      onConfigChange(configWithMeasurementUnit(config, null))
      return
    }
    onConfigChange(
      configWithMeasurementUnit(config, { kind: 'preset', code: value as MeasurementUnitCode }),
    )
  }

  function onCustomDraftChange(raw: string) {
    const sliced = raw.toLocaleLowerCase('ru').slice(0, MEASUREMENT_UNIT_CUSTOM_LABEL_MAX)
    setCustomDraft(sliced)
    skipExternalSync.current = true
    writeCustom(sliced, shortDraft)
  }

  function onShortDraftChange(raw: string) {
    const sliced = raw.toLocaleLowerCase('ru').slice(0, MEASUREMENT_UNIT_CUSTOM_SHORT_MAX)
    setShortDraft(sliced)
    skipExternalSync.current = true
    writeCustom(customDraft, sliced)
  }

  return (
    <Flex direction="column" gap="2">
      <Select.Root size="3" value={selectValue} onValueChange={onSelect}>
        <Select.Trigger style={{ width: '100%' }} />
        <Select.Content position="popper" className={contentClassName}>
          <UnitItem value={NONE_VALUE} icon={CircleOff} label="Нет единицы" />
          {MEASUREMENT_UNIT_PICKER_GROUPS.map((group) => (
            <Select.Group key={group.id}>
              <Select.Label>{group.title}</Select.Label>
              {group.sections.map((section) => (
                <Fragment key={section.title ?? 'main'}>
                  {section.title ? <Select.Label>{section.title}</Select.Label> : null}
                  {section.codes.map((code) => (
                    <UnitItem
                      key={code}
                      value={code}
                      icon={PRESET_ICONS[code]}
                      label={`${MEASUREMENT_UNIT_PRESET_BY_CODE[code].title} (${measurementUnitListSuffix(code)})`}
                    />
                  ))}
                </Fragment>
              ))}
            </Select.Group>
          ))}
          <Select.Group>
            <Select.Label>Другое</Select.Label>
            <UnitItem value={CUSTOM_VALUE} icon={Pencil} label="Свой вариант" />
          </Select.Group>
        </Select.Content>
      </Select.Root>

      {customChosen ? (
        <Flex gap="2">
          <TextField.Root
            size="3"
            style={{ flex: 1 }}
            value={customDraft}
            maxLength={MEASUREMENT_UNIT_CUSTOM_LABEL_MAX}
            placeholder="Полное: стаканы"
            aria-label="Полное название единицы"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => onCustomDraftChange(e.target.value)}
          />
          <TextField.Root
            size="3"
            style={{ flex: 1 }}
            value={shortDraft}
            maxLength={MEASUREMENT_UNIT_CUSTOM_SHORT_MAX}
            placeholder="Сокращённо: ст."
            aria-label="Сокращение единицы"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => onShortDraftChange(e.target.value)}
          />
        </Flex>
      ) : null}
    </Flex>
  )
}

/**
 * Иконка слева и короткое текстовое обозначение справа внутри числового поля.
 * У валюты справа текстовое сокращение (`руб`), не знак: иконка слева уже его показывает.
 */
export function NumberUnitMark({ unit }: { unit: MeasurementUnit | null }) {
  if (!unit) return null
  const Icon = unit.kind === 'custom' ? Info : PRESET_ICONS[unit.code]
  const suffix = measurementUnitInputSuffix(unit)
  const title = measurementUnitTitle(unit)

  return (
    <>
      <TextField.Slot side="left" pl="3">
        <Tooltip content={title}>
          <Text as="span" color="gray" aria-label={title} style={{ display: 'inline-flex' }}>
            <Icon size={16} aria-hidden />
          </Text>
        </Tooltip>
      </TextField.Slot>
      {suffix ? (
        <TextField.Slot side="right" pr="3">
          <Text as="span" size="2" color="gray">
            {suffix}
          </Text>
        </TextField.Slot>
      ) : null}
    </>
  )
}

function UnitItem({
  value,
  icon: Icon,
  label,
}: {
  value: string
  icon: LucideIcon
  label: string
}) {
  return (
    <Select.Item value={value}>
      <Flex align="center" gap="2">
        <Icon size={16} aria-hidden />
        <Text as="span" size="2">
          {label}
        </Text>
      </Flex>
    </Select.Item>
  )
}
