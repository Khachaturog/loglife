import { useEffect, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { Box, Button, Checkbox, CheckboxGroup, Flex, IconButton, Select, SegmentedControl, Text, TextField } from '@radix-ui/themes'
import { AUTO_GROW_TEXTAREA_MIN_ONE_LINE_PX, AutoGrowTextArea } from '@/components/AutoGrowTextArea'
import { AppBar } from '@/components/AppBar'
import { FillFormNumberStepper } from '@/components/FillFormNumberStepper'
import { PageLoading } from '@/components/PageLoading'
import { CheckIcon } from '@radix-ui/react-icons'
import { api } from '@/lib/api'
import {
  recentNumberSuggestions,
  recentSingleSelectSuggestions,
  type RecordWithAnswersForSuggestions,
} from '@/lib/fill-form-recent-suggestions'
import { DatePicker } from '@/components/DatePicker'
import { DurationInput } from '@/components/DurationInput'
import { todayLocalISO, nowTimeLocal } from '@/lib/format-utils'
import { blurActiveInputInForm, blurInputOnEnter } from '@/lib/ios-input-blur'
import { triggerHaptic } from '@/lib/haptics'
import type { BlockConfig, BlockRow, DeedWithBlocks, ValueJson } from '@/types/database'
import scaleSegmentedStyles from '@/components/ScaleSegmentedControl.module.css'
import layoutStyles from '@/styles/layout.module.css'
import styles from './FillFormPage.module.css'

function getBlockOptions(block: BlockRow): { id: string; label: string }[] {
  const fromConfig = (block.config as BlockConfig | null)?.options
  if (fromConfig?.length) return fromConfig.map((o) => ({ id: o.id, label: o.label }))
  return []
}

/** Одна и та же логика, что раньше была в цикле `requiredMissing`, для подсветки конкретного блока. */
function isRequiredBlockInvalid(block: BlockRow, answers: Record<string, ValueJson>): boolean {
  const v = answers[block.id]
  if (v === undefined) return true
  if ('number' in v && v.number === 0) return true
  if ('text' in v && (v.text ?? '').trim() === '') return true
  if ('optionId' in v && !v.optionId) return true
  if ('optionIds' in v && (!v.optionIds || v.optionIds.length === 0)) return true
  if ('scaleValue' in v && (v.scaleValue === undefined || v.scaleValue < 1)) return true
  if ('yesNo' in v && v.yesNo === undefined) return true
  if ('durationHms' in v) {
    const hms = v.durationHms ?? ''
    if (hms.length < 8 || !/^\d{2}:\d{2}:\d{2}$/.test(hms)) return true
  }
  return false
}

/**
 * Страница добавления записи к делу.
 * Форма с полями по блокам дела (число, текст, выбор, шкала, да/нет, время и т.д.).
 */
export function FillFormPage() {
  const { id: deedId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  // --- Состояние ---
  const [deed, setDeed] = useState<DeedWithBlocks | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [recordDate, setRecordDate] = useState(todayLocalISO())
  const [recordTime, setRecordTime] = useState(nowTimeLocal())
  const [answers, setAnswers] = useState<Record<string, ValueJson>>({})
  /** Последние записи дела — источник чипов «недавние значения» для number / single_select. */
  const [recentRecords, setRecentRecords] = useState<RecordWithAnswersForSuggestions[]>([])
  /** После первой попытки отправки показываем ошибки по обязательным блокам (и общее правило «хотя бы один ответ»). */
  const [validationAttempted, setValidationAttempted] = useState(false)

  // --- Загрузка дела и последних записей (подсказки на форме) ---
  useEffect(() => {
    if (!deedId) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      api.deeds.get(deedId),
      api.deeds.recentRecords(deedId, 10).catch((e) => {
        console.error(e instanceof Error ? e.message : 'Ошибка подсказок из записей')
        return [] as RecordWithAnswersForSuggestions[]
      }),
    ])
      .then(([data, recent]) => {
        if (!cancelled) {
          setDeed(data ?? null)
          setRecentRecords(recent)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error(e?.message ?? 'Ошибка загрузки дела')
          navigate('/', { replace: true })
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [deedId, navigate])

  const blocks = useMemo(() => deed?.blocks ?? [], [deed])

  // Подсказки по блокам: какие значения взять — по недавности записей; числа на экране — от большего к меньшему.
  const quickPickNumbersByBlockId = useMemo(() => {
    const m: Record<string, number[]> = {}
    for (const b of blocks) {
      if (b.block_type === 'number') m[b.id] = recentNumberSuggestions(recentRecords, b.id)
    }
    return m
  }, [blocks, recentRecords])

  const quickPickSelectIdsByBlockId = useMemo(() => {
    const m: Record<string, string[]> = {}
    for (const b of blocks) {
      if (b.block_type === 'single_select') {
        const opts = getBlockOptions(b)
        const valid = new Set(opts.map((o) => o.id))
        const labelById = Object.fromEntries(opts.map((o) => [o.id, o.label]))
        m[b.id] = recentSingleSelectSuggestions(recentRecords, b.id, valid, labelById)
      }
    }
    return m
  }, [blocks, recentRecords])

  const hasRequiredBlocks = useMemo(() => blocks.some((b) => b.is_required), [blocks])

  function sanitizeValue(v: ValueJson): ValueJson | null {
    // Убираем значения, которые визуально выглядят как "пусто" и которые не стоит отправлять на сервер.
    if ('number' in v) {
      if (v.number === 0) return null
      return v
    }
    if ('text' in v) {
      return v.text.trim() === '' ? null : v
    }
    if ('optionId' in v) {
      return v.optionId ? v : null
    }
    if ('optionIds' in v) {
      return v.optionIds.length ? v : null
    }
    if ('scaleValue' in v) {
      return v.scaleValue >= 1 ? v : null
    }
    if ('yesNo' in v) {
      return v // boolean: всегда валиден
    }
    if ('durationHms' in v) {
      const hms = v.durationHms
      if (hms.length < 8 || !/^\d{2}:\d{2}:\d{2}$/.test(hms)) return null
      return v
    }
    return null
  }

  const sanitizedAnswers = useMemo(() => {
    const next: Record<string, ValueJson> = {}
    for (const [k, v] of Object.entries(answers)) {
      const sv = sanitizeValue(v)
      if (!sv) continue
      next[k] = sv
    }
    return next
  }, [answers])

  const requiredMissing = useMemo(
    () => blocks.some((b) => b.is_required && isRequiredBlockInvalid(b, answers)),
    [blocks, answers]
  )

  const hasAnyAnswer = Object.keys(sanitizedAnswers).length > 0
  // Правило отправки (см. handleSubmit):
  // - если есть обязательные блоки — сохраняем только когда они заполнены
  // - если обязательных блоков нет — нужен хотя бы один непустой ответ

  function setAnswer(blockId: string, value: ValueJson) {
    setAnswers((prev) => ({ ...prev, [blockId]: value }))
  }

  function clearAnswer(blockId: string) {
    // `answers` типизирован как `Record<string, ValueJson>`, но на практике ключ может отсутствовать.
    // Поэтому используем delete с narrow через `any`, чтобы удалить ключ из состояния.
    setAnswers((prev) => {
      const next = { ...prev } as Record<string, ValueJson>
      delete (next as any)[blockId]
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    blurActiveInputInForm(e.currentTarget)
    if (!deedId || saving) return
    setValidationAttempted(true)
    const formValid = hasRequiredBlocks ? !requiredMissing : hasAnyAnswer
    if (!formValid) return
    setSaving(true)
    try {
      // Используем единый набор "чистых" значений (включая удаление пустых текстов/массивов).
      await api.deeds.createRecord(deedId, {
        record_date: recordDate,
        record_time: recordTime,
        answers: Object.keys(sanitizedAnswers).length ? sanitizedAnswers : undefined,
      })
      triggerHaptic('success', { intensity: 1 })
      navigate(-1)
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  // --- Рендер ---
  if (loading) {
    return (
      <PageLoading
        onBack={() => navigate(-1)}
        backButtonIcon="close"
        message="Загружаем форму…"
        titleReserve
        actionsReserveCount={1}
      />
    )
  }

  if (!deed) {
    return (
      <Box p="4">
        <AppBar onBack={() => navigate(-1)} backButtonIcon="close" />
        <Text as="p" color="crimson">
          Дело не найдено.
        </Text>
      </Box>
    )
  }

  return (
    <Box className={layoutStyles.pageContainer} >
      <form onSubmit={handleSubmit}>
        <Flex direction="column" gap="3">
        <AppBar
          onBack={() => navigate(-1)}
          backButtonIcon="close"
          title={`Добавление`}
          actions={
            <IconButton
              size="3"
              radius='full'
              variant="classic"
              type="submit"
              disabled={saving}
              aria-label={saving ? 'Сохранение…' : 'Добавить запись'}
            >
              <CheckIcon width={18} height={18} />
            </IconButton>
          }
        />

        <Flex direction="column" gap="4" >

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium" as="label" htmlFor="deed">Дело</Text>
            <Text size="3">{deed?.name}</Text>
          </Flex>

          {/* Дата и время */}
          <Flex gap="4">

            <Flex direction="column" gap="1">
              <Text size="2" weight="medium" as="label" htmlFor="date">Дата</Text>
              <DatePicker value={recordDate} onChange={setRecordDate} />
            </Flex>

            <Flex direction="column" gap="1">
              <Text size="2" weight="medium">Время</Text>
              <TextField.Root
                size="3"
                type="time"
                value={recordTime}
                onChange={(e) => setRecordTime(e.target.value)}
                onKeyDown={blurInputOnEnter}
              />
            </Flex>
          </Flex>

          {/* Поля по блокам */}
          {blocks.map((block) => {
            const numberChipValues = quickPickNumbersByBlockId[block.id]
            const selectChipIds = quickPickSelectIdsByBlockId[block.id]
            const numberAns = (answers[block.id] as { number?: number } | undefined)?.number
            const numberFilled =
              numberAns !== undefined && Number.isFinite(numberAns) && numberAns > 0
            const selectOptionId = (answers[block.id] as { optionId?: string } | undefined)?.optionId
            const selectOptionLabelById =
              block.block_type === 'single_select'
                ? Object.fromEntries(getBlockOptions(block).map((o) => [o.id, o.label]))
                : ({} as Record<string, string>)
            return (
            <Flex key={block.id} direction="column" gap="1">
              <Flex direction="row" align="center" gap="3" wrap="wrap">
                <Text size="2" weight="medium">
                  {block.title}{block.is_required && ' *'}
                </Text>
                {answers[block.id] !== undefined && block.block_type !== 'yes_no' && (
                  <Button
                    type="button"
                    size="2"
                    variant="ghost"
                    color="gray"
                    onClick={() => {
                      triggerHaptic('medium', { intensity: 1 })
                      clearAnswer(block.id)
                    }}
                  >
                    Сбросить
                  </Button>
                )}
              </Flex>
              {block.block_type === 'number' && (
                <>
                  {/*
                    Не вешаем key от «пусто/заполнено» на поле/stepper: иначе при первом шаге ± или первой цифре
                    весь блок remount’ится — сбрасывается удержание кнопок и фокус.
                    Чипы «недавние значения» показываем только пока число пустое; после выбора чипа или ввода скрываются.
                  */}
                  <Flex gap="2" align="center">
                    <TextField.Root
                      style={{ flex: 1 }}
                      size="3"
                      /* type="number" на iOS часто ломает «Готово» на клавиатуре; ввод и так парсим в onChange */
                      type="text"
                      inputMode="decimal"
                      enterKeyHint="done"
                      autoComplete="off"
                      autoCorrect="off"
                      onKeyDown={blurInputOnEnter}
                      value={numberAns === undefined ? '' : String(numberAns)}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === '') {
                          clearAnswer(block.id)
                          return
                        }

                        const parsed = Number(raw)
                        // Если браузер возвращает нечисло/0 — считаем это очисткой.
                        if (!Number.isFinite(parsed) || parsed === 0) {
                          clearAnswer(block.id)
                          return
                        }

                        setAnswer(block.id, { number: Math.max(0, parsed) })
                      }}
                    />
                    <FillFormNumberStepper
                      blockId={block.id}
                      value={(answers[block.id] as { number?: number } | undefined)?.number ?? 0}
                      setAnswers={setAnswers}
                    />
                  </Flex>
                  {!numberFilled && numberChipValues && numberChipValues.length > 0 && (
                    <Flex gap="1" wrap="wrap">
                      {numberChipValues.map((val) => (
                        <Button
                          key={val}
                          type="button"
                          size="3"
                          color="gray"
                          variant="soft"
                          radius="full"
                          onClick={() => {
                            triggerHaptic('medium', { intensity: 1 })
                            setAnswer(block.id, { number: val })
                          }}
                        >
                          {val}
                        </Button>
                      ))}
                    </Flex>
                  )}
                </>
              )}
              {block.block_type === 'text_paragraph' && (
                <AutoGrowTextArea
                  size="3"
                  value={(answers[block.id] as { text?: string } | undefined)?.text ?? ''}
                  onChange={(e) => setAnswer(block.id, { text: e.target.value })}
                  placeholder=""
                  minHeightPx={AUTO_GROW_TEXTAREA_MIN_ONE_LINE_PX}
                />
              )}
              {block.block_type === 'single_select' && (
                <>
                  <Select.Root
                    key={`${block.id}-fill-ss-${(answers[block.id] as { optionId?: string } | undefined)?.optionId ?? 'cleared'}`}
                    size="3"
                    value={(answers[block.id] as { optionId?: string } | undefined)?.optionId || undefined}
                    onValueChange={(v) => {
                      triggerHaptic('medium', { intensity: 1 })
                      setAnswer(block.id, { optionId: v })
                    }}
                  >
                    <Select.Trigger placeholder="Выберите" />
                    <Select.Content>
                      {getBlockOptions(block).map((opt) => (
                        <Select.Item key={opt.id} value={opt.id}>{opt.label}</Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                  {!selectOptionId && selectChipIds && selectChipIds.length > 0 && (
                    <Flex gap="1" wrap="wrap" mt="1">
                      {selectChipIds.map((optId) => (
                        <Button
                          key={optId}
                          type="button"
                          size="3"
                          color="gray"
                          variant="soft"
                          radius="full"
                          onClick={() => {
                            triggerHaptic('medium', { intensity: 1 })
                            setAnswer(block.id, { optionId: optId })
                          }}
                        >
                          {selectOptionLabelById[optId] ?? optId}
                        </Button>
                      ))}
                    </Flex>
                  )}
                </>
              )}
              {block.block_type === 'multi_select' && (
                <CheckboxGroup.Root
                  // Не вешаем key от «пусто/есть ответ»: при первом выборе remount ломает контролируемую группу Radix
                  // (сброс выбора или «слипание» чекбоксов при втором клике).
                  size="3"
                  value={
                    (answers[block.id] as { optionIds?: string[] } | undefined)?.optionIds ?? []
                  }
                  onValueChange={(nextValues) => {
                    triggerHaptic('medium', { intensity: 1 })
                    // Без flushSync при быстрых кликах по разным пунктам Radix считает следующий шаг
                    // от устаревшего `value` (батч React) — в onValueChange приходит урезанный массив.
                    flushSync(() => {
                      setAnswer(block.id, { optionIds: nextValues })
                    })
                  }}
                >
                  <Flex direction="column" gap="2">
                    {getBlockOptions(block).map((opt) => (
                      <CheckboxGroup.Item
                        key={opt.id}
                        value={opt.id}
                        className={styles.checkboxLabel}
                      >
                        {opt.label}
                      </CheckboxGroup.Item>
                    ))}
                  </Flex>
                </CheckboxGroup.Root>
              )}
              {block.block_type === 'scale' && (
                <SegmentedControl.Root
                  className={scaleSegmentedStyles.root}
                  key={`${block.id}-fill-scale-${answers[block.id] !== undefined ? 'set' : 'none'}`}
                  value={
                    (answers[block.id] as { scaleValue?: number } | undefined)?.scaleValue?.toString()
                  }
                  onValueChange={(v) => {
                    triggerHaptic('medium', { intensity: 1 })
                    setAnswer(block.id, { scaleValue: Number(v) })
                  }}
                  // Узкий экран — компактнее по ширине; высота — через ScaleSegmentedControl.module.css.
                  size={{ initial: '1', sm: '3' }}
                >
                  {Array.from(
                    { length: Math.min(10, Math.max(1, (block.config as BlockConfig | null)?.divisions ?? 5)) },
                    (_, i) => i + 1
                  ).map((n) => (
                    <SegmentedControl.Item key={n} value={String(n)}>
                      {n}
                    </SegmentedControl.Item>
                  ))}
                </SegmentedControl.Root>
              )}
              {block.block_type === 'duration' && (
                <DurationInput
                  value={(answers[block.id] as { durationHms?: string } | undefined)?.durationHms ?? ''}
                  onChange={(hms) => setAnswer(block.id, { durationHms: hms })}
                  placeholder="00:00:00"
                />
              )}
              {block.block_type === 'yes_no' && (
                <Text as="label" size="3" className={styles.checkboxLabel}>
                  <Flex align="center" gap="2">
                    <Checkbox
                      size="3"
                      checked={(answers[block.id] as { yesNo?: boolean } | undefined)?.yesNo === true}
                      onCheckedChange={(c) => {
                        triggerHaptic('medium', { intensity: 1 })
                        setAnswer(block.id, { yesNo: c === true })
                      }}
                    />
                    Выполнено
                  </Flex>
                </Text>
              )}
              {block.is_required && validationAttempted && isRequiredBlockInvalid(block, answers) && (
                <Text size="1" color="crimson" role="alert">
                  Заполни поле
                </Text>
              )}
            </Flex>
            )
          })}

          {validationAttempted && !hasRequiredBlocks && !hasAnyAnswer && (
            <Text size="2" color="crimson" role="alert">
              Укажи хотя бы один ответ
            </Text>
          )}
        </Flex>
        </Flex>
      </form>
    </Box>
  )
}
