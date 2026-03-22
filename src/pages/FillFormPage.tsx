import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Box, Button, CheckboxGroup, Flex, IconButton, RadioGroup, Select, SegmentedControl, Text, TextArea, TextField } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import { DeedSummaryCard } from '@/components/DeedSummaryCard'
import { FillFormNumberStepper } from '@/components/FillFormNumberStepper'
import { PageLoading } from '@/components/PageLoading'
import { CheckIcon } from '@radix-ui/react-icons'
import { api } from '@/lib/api'
import { DatePicker } from '@/components/DatePicker'
import { DurationInput } from '@/components/DurationInput'
import { todayLocalISO, nowTimeLocal } from '@/lib/format-utils'
import type { BlockConfig, BlockRow, DeedWithBlocks, ValueJson } from '@/types/database'
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
  /** После первой попытки отправки показываем ошибки по обязательным блокам (и общее правило «хотя бы один ответ»). */
  const [validationAttempted, setValidationAttempted] = useState(false)

  // --- Загрузка дела ---
  useEffect(() => {
    if (!deedId) return
    let cancelled = false
    setLoading(true)
    api.deeds
      .get(deedId)
      .then((data) => { if (!cancelled) setDeed(data ?? null) })
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
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
          title={`Добавление записи`}
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

        {/* Контекст: к какому делу относится форма (название и описание не теряются среди полей). */}
        <DeedSummaryCard deed={deed} />

        <Flex direction="column" gap="4" >
          {/* Дата и время */}
          <Flex gap="4">
            <Flex direction="column" gap="1">
              <Text size="2" weight="medium">Дата</Text>
              <DatePicker value={recordDate} onChange={setRecordDate} />
            </Flex>
            <Flex direction="column" gap="1">
              <Text size="2" weight="medium">Время</Text>
              <TextField.Root
                size="3"
                type="time"
                value={recordTime}
                onChange={(e) => setRecordTime(e.target.value)}
              />
            </Flex>
          </Flex>

          {/* Поля по блокам */}
          {blocks.map((block) => (
            <Flex key={block.id} direction="column" gap="1">
              <Flex direction="row" align="center" gap="3" wrap="wrap">
                <Text size="2" weight="medium">
                  {block.title}{block.is_required && ' *'}
                </Text>
                {answers[block.id] !== undefined && (
                  <Button
                    type="button"
                    size="2"
                    variant="ghost"
                    color="gray"
                    onClick={() => clearAnswer(block.id)}
                  >
                    Сбросить
                  </Button>
                )}
              </Flex>
              {block.block_type === 'number' && (
                // Не вешаем key от «пусто/заполнено»: иначе при первом шаге ± или первой цифре
                // весь блок remount’ится — сбрасывается удержание кнопок и фокус в поле ввода.
                <Flex gap="2" align="center">
                  <TextField.Root 
                    style={{ flex: 1 }}
                    size="3"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={(answers[block.id] as { number?: number } | undefined)?.number ?? ''}
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
              )}
              {block.block_type === 'text_short' && (
                <TextField.Root
                  size="3"
                  value={(answers[block.id] as { text?: string } | undefined)?.text ?? ''}
                  onChange={(e) => setAnswer(block.id, { text: e.target.value })}
                />
              )}
              {block.block_type === 'text_paragraph' && (
                <TextArea
                  value={(answers[block.id] as { text?: string } | undefined)?.text ?? ''}
                  onChange={(e) => setAnswer(block.id, { text: e.target.value })}
                  placeholder=""
                  resize="vertical"
                />
              )}
              {block.block_type === 'single_select' && (
                <Select.Root
                  key={`${block.id}-fill-ss-${(answers[block.id] as { optionId?: string } | undefined)?.optionId ?? 'cleared'}`}
                  size="3"
                  value={(answers[block.id] as { optionId?: string } | undefined)?.optionId || undefined}
                  onValueChange={(v) => setAnswer(block.id, { optionId: v })}
                >
                  <Select.Trigger placeholder="Выберите" />
                  <Select.Content>
                    {getBlockOptions(block).map((opt) => (
                      <Select.Item key={opt.id} value={opt.id}>{opt.label}</Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              )}
              {block.block_type === 'multi_select' && (
                <CheckboxGroup.Root
                  key={`${block.id}-fill-ms-${answers[block.id] !== undefined ? 'set' : 'none'}`}
                  size="3"
                  value={
                    (answers[block.id] as { optionIds?: string[] } | undefined)?.optionIds ?? []
                  }
                  onValueChange={(nextValues) => {
                    // Сохраняем выбранные опции блока в ответе
                    setAnswer(block.id, { optionIds: nextValues })
                  }}
                >
                  <Flex direction="column" gap="1">
                    {getBlockOptions(block).map((opt) => (
                      <Text as="label" key={opt.id} size="1" className={styles.checkboxLabel}>
                        <CheckboxGroup.Item value={opt.id}>{opt.label}</CheckboxGroup.Item>
                      </Text>
                    ))}
                  </Flex>
                </CheckboxGroup.Root>
              )}
              {block.block_type === 'scale' && (
                <SegmentedControl.Root
                  key={`${block.id}-fill-scale-${answers[block.id] !== undefined ? 'set' : 'none'}`}
                  value={
                    (answers[block.id] as { scaleValue?: number } | undefined)?.scaleValue?.toString()
                  }
                  onValueChange={(v) => setAnswer(block.id, { scaleValue: Number(v) })}
                  size="2"
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
                <RadioGroup.Root
                  key={`${block.id}-fill-yn-${answers[block.id] !== undefined ? 'set' : 'none'}`}
                  size="3"
                  value={
                    (answers[block.id] as { yesNo?: boolean } | undefined)?.yesNo === true
                      ? 'true'
                      : (answers[block.id] as { yesNo?: boolean } | undefined)?.yesNo === false
                        ? 'false'
                        : ''
                  }
                  onValueChange={(v) => setAnswer(block.id, { yesNo: v === 'true' })}
                >
                  <Flex gap="4">
                    <Text as="label" size="3" className={styles.checkboxLabel}>
                      <RadioGroup.Item value="true" />
                      Да
                    </Text>
                    <Text as="label" size="3" className={styles.checkboxLabel}>
                      <RadioGroup.Item value="false" />
                      Нет
                    </Text>
                  </Flex>
                </RadioGroup.Root>
              )}
              {block.is_required && validationAttempted && isRequiredBlockInvalid(block, answers) && (
                <Text size="1" color="crimson" role="alert">
                  Заполни поле
                </Text>
              )}
            </Flex>
          ))}

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
