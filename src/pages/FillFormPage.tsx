import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import { flushSync } from 'react-dom'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CheckboxCards,
  CheckboxGroup,
  Flex,
  Heading,
  IconButton,
  Separator,
  Text,
  TextField,
} from '@radix-ui/themes'
import { AUTO_GROW_TEXTAREA_MIN_ONE_LINE_PX, AutoGrowTextArea } from '@/components/AutoGrowTextArea'
import { AppBar } from '@/components/AppBar'
import { SingleSelectAnswerField } from '@/components/SingleSelectAnswerField'
import { FillFormNumberStepper } from '@/components/FillFormNumberStepper'
import { PageLoading } from '@/components/PageLoading'
import { Check, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { getSingleSelectUi } from '@/lib/block-config'
import { initialAnswersFromBlockDefaults } from '@/lib/block-default-value'
import { api } from '@/lib/api'
import {
  recentNumberSuggestions,
  recentSingleSelectSuggestions,
  type RecordWithAnswersForSuggestions,
} from '@/lib/fill-form-recent-suggestions'
import { DatePicker } from '@/components/DatePicker'
import { DurationInput } from '@/components/DurationInput'
import { ScaleAnswerField } from '@/components/ScaleAnswerField'
import { todayLocalISO, nowTimeLocal } from '@/lib/format-utils'
import { blurActiveInputInForm, blurInputOnEnter } from '@/lib/ios-input-blur'
import { triggerHaptic } from '@/lib/haptics'
import type { BlockConfig, BlockRow, DeedWithBlocks, ValueJson } from '@/types/database'
import layoutStyles from '@/styles/layout.module.css'

/** Один черновик на форме: несколько таких уходят в отдельные записи по галочке. */
type FillDraft = {
  key: string
  recordDate: string
  recordTime: string
  answers: Record<string, ValueJson>
  /** После ввода / ± / выбора в селекте / тапа по чипу скрываем чипы, пока ответ снова не «пустой». */
  recentChipsDismissedByBlock: Record<string, boolean>
}

function getBlockOptions(block: BlockRow): { id: string; label: string }[] {
  const fromConfig = (block.config as BlockConfig | null)?.options
  if (fromConfig?.length) return fromConfig.map((o) => ({ id: o.id, label: o.label }))
  return []
}

function createFillDraft(
  overrides?: Partial<Pick<FillDraft, 'recordDate' | 'recordTime' | 'answers'>>,
): FillDraft {
  return {
    key:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    recordDate: overrides?.recordDate ?? todayLocalISO(),
    recordTime: overrides?.recordTime ?? nowTimeLocal(),
    answers: overrides?.answers ?? {},
    recentChipsDismissedByBlock: {},
  }
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
  if ('url' in v && (v.url ?? '').trim() === '') return true
  return false
}

function sanitizeValue(v: ValueJson): ValueJson | null {
  // Убираем значения, которые визуально выглядят как "пусто" и которые не стоит отправлять на сервер.
  if ('number' in v) {
    if (v.number === 0) return null
    return v
  }
  // Пустой текст не включаем в payload — на сервер уходит без ключа (см. `omitOptionalEmptyTextFromRecordAnswers` в api).
  if ('text' in v) {
    const t = v.text ?? ''
    if (t.trim() === '') return null
    return v
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
  if ('url' in v) {
    if ((v.url ?? '').trim() === '') return null
    return v
  }
  return null
}

function sanitizedAnswersOf(answers: Record<string, ValueJson>): Record<string, ValueJson> {
  const next: Record<string, ValueJson> = {}
  for (const [k, v] of Object.entries(answers)) {
    const sv = sanitizeValue(v)
    if (!sv) continue
    next[k] = sv
  }
  return next
}

/** На форме новой записи «пустое число» = нет ключа; не держим { number: 0 } и нечисла. */
function stripEmptyNumbers(
  answers: Record<string, ValueJson>,
  numberIds: Set<string>,
): Record<string, ValueJson> {
  let changed = false
  const next = { ...answers }
  for (const id of numberIds) {
    const v = next[id] as { number?: number } | undefined
    if (v === undefined) continue
    const n = v.number
    if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) {
      delete (next as Record<string, ValueJson | undefined>)[id]
      changed = true
    }
  }
  return changed ? next : answers
}

function isDraftSubmittable(
  draft: FillDraft,
  blocks: BlockRow[],
  hasRequiredBlocks: boolean,
): boolean {
  // Если есть обязательные блоки — сохраняем только когда они заполнены.
  // Если обязательных нет — нужен хотя бы один непустой ответ.
  if (hasRequiredBlocks) {
    return !blocks.some((b) => b.is_required && isRequiredBlockInvalid(b, draft.answers))
  }
  return Object.keys(sanitizedAnswersOf(draft.answers)).length > 0
}

type FillFormEntryProps = {
  draft: FillDraft
  index: number
  /** Несколько записей: заголовок «Запись N», удаление и разделитель. */
  multiple: boolean
  saving: boolean
  blocks: BlockRow[]
  validationAttempted: boolean
  hasRequiredBlocks: boolean
  quickPickNumbersByBlockId: Record<string, number[]>
  quickPickSelectIdsByBlockId: Record<string, string[]>
  onDateChange: (key: string, value: string) => void
  onTimeChange: (key: string, value: string) => void
  onAnswersChange: (
    key: string,
    action: SetStateAction<Record<string, ValueJson>>,
  ) => void
  onDismissChips: (key: string, blockId: string) => void
  onRestoreChips: (key: string, blockId: string) => void
  onRemove: (key: string) => void
  onEntryNode: (key: string, node: HTMLDivElement | null) => void
}

/**
 * Поля одной новой записи: дата, время и блоки дела.
 * Ответы живут в своём черновике, чтобы на экране можно было заполнить несколько записей сразу.
 */
function FillFormEntry({
  draft,
  index,
  multiple,
  saving,
  blocks,
  validationAttempted,
  hasRequiredBlocks,
  quickPickNumbersByBlockId,
  quickPickSelectIdsByBlockId,
  onDateChange,
  onTimeChange,
  onAnswersChange,
  onDismissChips,
  onRestoreChips,
  onRemove,
  onEntryNode,
}: FillFormEntryProps) {
  const { key: draftKey, answers, recentChipsDismissedByBlock } = draft
  const hasAnyAnswer = Object.keys(sanitizedAnswersOf(answers)).length > 0
  const dateId = `date-${draftKey}`
  const timeId = `time-${draftKey}`

  const setEntryNode = useCallback(
    (node: HTMLDivElement | null) => {
      onEntryNode(draftKey, node)
    },
    [draftKey, onEntryNode],
  )

  // Степпер ± пишет в Record ответов; оборачиваем, чтобы обновлялся только этот черновик.
  const setAnswers = useCallback<Dispatch<SetStateAction<Record<string, ValueJson>>>>(
    (action) => {
      onAnswersChange(draftKey, action)
    },
    [draftKey, onAnswersChange],
  )

  function setAnswer(blockId: string, value: ValueJson) {
    onAnswersChange(draftKey, (prev) => ({ ...prev, [blockId]: value }))
  }

  function dismissRecentChips(blockId: string) {
    onDismissChips(draftKey, blockId)
  }

  function restoreRecentChips(blockId: string) {
    onRestoreChips(draftKey, blockId)
  }

  function clearAnswer(blockId: string) {
    onAnswersChange(draftKey, (prev) => {
      const next = { ...prev }
      delete (next as Record<string, ValueJson | undefined>)[blockId]
      return next
    })
    restoreRecentChips(blockId)
  }

  return (
    <Flex
      ref={setEntryNode}
      direction="column"
      gap="3"
      style={{ scrollMarginTop: 'var(--space-4)' }}
    >
      {multiple && (
        <Flex align="center" justify="between" gap="3">
          <Heading as="h2" size="4">
            Запись {index + 1}
          </Heading>
          <IconButton
            type="button"
            size="3"
            variant="ghost"
            color="red"
            aria-label={`Удалить запись ${index + 1}`}
            disabled={saving}
            onClick={() => {
              triggerHaptic('medium', { intensity: 1 })
              onRemove(draftKey)
            }}
          >
            <Trash2 size={16} />
          </IconButton>
        </Flex>
      )}

      <Card>
        <Flex gap="4">
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium" as="label" htmlFor={dateId}>
              Дата
            </Text>
            <DatePicker
              id={dateId}
              value={draft.recordDate}
              onChange={(value) => onDateChange(draftKey, value)}
            />
          </Flex>
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium" as="label" htmlFor={timeId}>
              Время
            </Text>
            <TextField.Root
              id={timeId}
              size="3"
              type="time"
              value={draft.recordTime}
              onChange={(e) => onTimeChange(draftKey, e.target.value)}
              onKeyDown={blurInputOnEnter}
            />
          </Flex>
        </Flex>
      </Card>

      {blocks.map((block) => {
        const numberChipValues = quickPickNumbersByBlockId[block.id]
        const selectChipIds = quickPickSelectIdsByBlockId[block.id]
        const numberAns = (answers[block.id] as { number?: number } | undefined)?.number
        const chipsDismissed = !!recentChipsDismissedByBlock[block.id]
        const showNumberRecentChips =
          (block.recent_suggestions_enabled ?? true) &&
          !!numberChipValues?.length &&
          !chipsDismissed
        const showSelectRecentChips =
          (block.recent_suggestions_enabled ?? true) &&
          !!selectChipIds?.length &&
          !chipsDismissed
        const selectOptionLabelById =
          block.block_type === 'single_select'
            ? Object.fromEntries(getBlockOptions(block).map((o) => [o.id, o.label]))
            : ({} as Record<string, string>)
        return (
          <Card key={block.id}>
            <Flex direction="column" gap="1">
              <Flex direction="row" align="baseline" gap="3" wrap="wrap" mr="2px">
                <Text size="3" weight="medium" style={{ flex: 1, minWidth: 0 }}>
                  {block.title}
                  {block.is_required && ' *'}
                </Text>
                {answers[block.id] !== undefined && block.block_type !== 'yes_no' && (
                  <IconButton
                    type="button"
                    size="3"
                    variant="ghost"
                    color="red"
                    radius="large"
                    aria-label={`Сбросить ${block.title}`}
                    onClick={() => {
                      triggerHaptic('medium', { intensity: 1 })
                      clearAnswer(block.id)
                    }}
                  >
                    <RotateCcw size={16} />
                  </IconButton>
                )}
              </Flex>
              {block.block_type === 'number' && (
                <>
                  {/*
                    Не вешаем key от «пусто/заполнено» на поле/stepper: иначе при первом шаге ± или первой цифре
                    весь блок remount’ится — сбрасывается удержание кнопок и фокус.
                    Чипы: скрываются после ввода / ± / тапа по чипу; снова при пустом ответе (стирание, «Сбросить», − до нуля).
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

                        dismissRecentChips(block.id)
                        setAnswer(block.id, { number: Math.max(0, parsed) })
                      }}
                    />
                    <FillFormNumberStepper
                      blockId={block.id}
                      value={(answers[block.id] as { number?: number } | undefined)?.number ?? 0}
                      setAnswers={setAnswers}
                      onUserAdjusted={() => dismissRecentChips(block.id)}
                      onClearedToEmpty={() => restoreRecentChips(block.id)}
                    />
                  </Flex>
                  {showNumberRecentChips && (
                    <Flex gap="1" wrap="wrap">
                      {numberChipValues!.map((val) => (
                        <Button
                          key={val}
                          type="button"
                          size="2"
                          color="gray"
                          variant="soft"
                          radius="full"
                          onClick={() => {
                            triggerHaptic('medium', { intensity: 1 })
                            dismissRecentChips(block.id)
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
              {block.block_type === 'url' && (
                <TextField.Root
                  size="3"
                  type="text"
                  inputMode="url"
                  autoComplete="url"
                  placeholder="https://"
                  value={(answers[block.id] as { url?: string } | undefined)?.url ?? ''}
                  onKeyDown={blurInputOnEnter}
                  onChange={(e) => setAnswer(block.id, { url: e.target.value })}
                />
              )}
              {block.block_type === 'single_select' && (
                <>
                  <SingleSelectAnswerField
                    uiMode={getSingleSelectUi(block.config as BlockConfig)}
                    options={getBlockOptions(block)}
                    optionId={
                      (answers[block.id] as { optionId?: string } | undefined)?.optionId ||
                      undefined
                    }
                    onOptionIdChange={(v) => {
                      triggerHaptic('medium', { intensity: 1 })
                      dismissRecentChips(block.id)
                      if (v === undefined) {
                        clearAnswer(block.id)
                        return
                      }
                      setAnswer(block.id, { optionId: v })
                    }}
                    selectRemountKey={`${draftKey}-${block.id}-fill-ss-${(answers[block.id] as { optionId?: string } | undefined)?.optionId ?? 'cleared'}`}
                  />
                  {showSelectRecentChips && (
                    <Flex gap="1" wrap="wrap" mt="1">
                      {selectChipIds!.map((optId) => (
                        <Button
                          key={optId}
                          type="button"
                          size="2"
                          color="gray"
                          variant="soft"
                          radius="full"
                          onClick={() => {
                            triggerHaptic('medium', { intensity: 1 })
                            dismissRecentChips(block.id)
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
                  {getBlockOptions(block).map((opt) => (
                    <CheckboxGroup.Item key={opt.id} value={opt.id}>
                      {opt.label}
                    </CheckboxGroup.Item>
                  ))}
                </CheckboxGroup.Root>
              )}
              {block.block_type === 'scale' && (
                <ScaleAnswerField
                  key={`${draftKey}-${block.id}-fill-scale-${answers[block.id] !== undefined ? 'set' : 'none'}`}
                  config={block.config as BlockConfig | null}
                  value={(answers[block.id] as { scaleValue?: number } | undefined)?.scaleValue}
                  onScaleValueChange={(n) => {
                    triggerHaptic('medium', { intensity: 1 })
                    setAnswer(block.id, { scaleValue: n })
                  }}
                  size={{ initial: '1', sm: '2' }}
                />
              )}
              {block.block_type === 'duration' && (
                <DurationInput
                  value={
                    (answers[block.id] as { durationHms?: string } | undefined)?.durationHms ?? ''
                  }
                  onChange={(hms) => setAnswer(block.id, { durationHms: hms })}
                  placeholder="00:00:00"
                />
              )}
              {block.block_type === 'yes_no' && (
                <CheckboxCards.Root
                  size="2"
                  columns="1"
                  gap="2"
                  value={
                    (answers[block.id] as { yesNo?: boolean } | undefined)?.yesNo === true
                      ? ['done']
                      : []
                  }
                  onValueChange={(newValues) => {
                    triggerHaptic('medium', { intensity: 1 })
                    setAnswer(block.id, { yesNo: newValues.includes('done') })
                  }}
                >
                  <CheckboxCards.Item value="done">Выполнено</CheckboxCards.Item>
                </CheckboxCards.Root>
              )}
              {block.is_required &&
                validationAttempted &&
                isRequiredBlockInvalid(block, answers) && (
                  <Text size="1" color="crimson" role="alert">
                    Заполни поле
                  </Text>
                )}
            </Flex>
          </Card>
        )
      })}

      {validationAttempted && !hasRequiredBlocks && !hasAnyAnswer && (
        <Text size="2" color="crimson" role="alert">
          Укажи хотя бы один ответ
        </Text>
      )}

      {/* {multiple && <Separator size="4" />} */}
    </Flex>
  )
}

/**
 * Страница добавления записи к делу.
 * Форма с полями по блокам дела; кнопка «Ещё запись» добавляет ещё один такой набор.
 */
export function FillFormPage() {
  const { id: deedId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  /** Один раз подмешиваем дефолты блоков и при необходимости ответы из «Дублировать» в первую запись. */
  const initialAnswersSeededRef = useRef(false)
  /** Пока идёт сохранение — не даём второму сабмиту создать дубликаты. */
  const savingRef = useRef(false)
  const entryNodesRef = useRef(new Map<string, HTMLDivElement>())
  /** Ключ записи, которую нужно прокрутить в зону видимости после добавления. */
  const scrollToKeyRef = useRef<string | null>(null)
  const saveErrorNodeRef = useRef<HTMLDivElement | null>(null)

  // --- Состояние ---
  const [deed, setDeed] = useState<DeedWithBlocks | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [drafts, setDrafts] = useState<FillDraft[]>(() => [createFillDraft()])
  /** Последние записи дела — источник чипов «недавние значения» для number / single_select. */
  const [recentRecords, setRecentRecords] = useState<RecordWithAnswersForSuggestions[]>([])
  /** После первой попытки отправки показываем ошибки по каждой записи. */
  const [validationAttempted, setValidationAttempted] = useState(false)
  /** Частичный или полный сбой сохранения — текст под кнопкой «Ещё запись». */
  const [saveError, setSaveError] = useState<string | null>(null)

  const setEntryNode = useCallback((key: string, node: HTMLDivElement | null) => {
    if (node) entryNodesRef.current.set(key, node)
    else entryNodesRef.current.delete(key)
  }, [])

  // Смена дела — снова один пустой черновик и дефолты при следующей загрузке.
  useEffect(() => {
    initialAnswersSeededRef.current = false
    setDrafts([createFillDraft()])
    setValidationAttempted(false)
    setSaveError(null)
  }, [deedId])

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
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [deedId, navigate])

  // Дефолты из шаблона блоков + опционально значения с «Дублировать» (только первая запись).
  useEffect(() => {
    if (!deedId || !deed || deed.id !== deedId || initialAnswersSeededRef.current) return
    initialAnswersSeededRef.current = true
    const blockList = deed.blocks ?? []
    const blockIds = new Set(blockList.map((b) => b.id))
    const st = location.state as { fillDuplicateAnswers?: Record<string, ValueJson> } | null | undefined
    const src = st?.fillDuplicateAnswers
    const overlay: Record<string, ValueJson> = {}
    if (src && typeof src === 'object') {
      for (const [bid, val] of Object.entries(src)) {
        if (blockIds.has(bid)) overlay[bid] = val
      }
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    }
    const defaults = initialAnswersFromBlockDefaults(blockList, new Set(Object.keys(overlay)))
    const seeded = { ...defaults, ...overlay }
    setDrafts((prev) => {
      const [first, ...rest] = prev
      if (!first) return [createFillDraft({ answers: seeded })]
      return [{ ...first, answers: seeded }, ...rest]
    })
  }, [deed, deedId, location.pathname, location.search, location.state, navigate])

  const blocks = useMemo(() => deed?.blocks ?? [], [deed])

  const numberIds = useMemo(
    () => new Set(blocks.filter((b) => b.block_type === 'number').map((b) => b.id)),
    [blocks],
  )

  useLayoutEffect(() => {
    if (numberIds.size === 0) return
    setDrafts((prev) => {
      let changed = false
      const next = prev.map((draft) => {
        const answers = stripEmptyNumbers(draft.answers, numberIds)
        if (answers === draft.answers) return draft
        changed = true
        return { ...draft, answers }
      })
      return changed ? next : prev
    })
  }, [drafts, numberIds])

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

  const updateDraftAnswers = useCallback(
    (key: string, action: SetStateAction<Record<string, ValueJson>>) => {
      setDrafts((prev) =>
        prev.map((draft) => {
          if (draft.key !== key) return draft
          const answers = typeof action === 'function' ? action(draft.answers) : action
          return { ...draft, answers }
        }),
      )
    },
    [],
  )

  const setDraftDate = useCallback((key: string, recordDate: string) => {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, recordDate } : draft)))
  }, [])

  const setDraftTime = useCallback((key: string, recordTime: string) => {
    setDrafts((prev) => prev.map((draft) => (draft.key === key ? { ...draft, recordTime } : draft)))
  }, [])

  const dismissRecentChips = useCallback((key: string, blockId: string) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.key !== key || draft.recentChipsDismissedByBlock[blockId]) return draft
        return {
          ...draft,
          recentChipsDismissedByBlock: { ...draft.recentChipsDismissedByBlock, [blockId]: true },
        }
      }),
    )
  }, [])

  const restoreRecentChips = useCallback((key: string, blockId: string) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.key !== key || !draft.recentChipsDismissedByBlock[blockId]) return draft
        const next = { ...draft.recentChipsDismissedByBlock }
        delete next[blockId]
        return { ...draft, recentChipsDismissedByBlock: next }
      }),
    )
  }, [])

  const removeDraft = useCallback((key: string) => {
    if (savingRef.current) return
    setSaveError(null)
    setDrafts((prev) => (prev.length <= 1 ? prev : prev.filter((draft) => draft.key !== key)))
  }, [])

  function addDraft() {
    if (savingRef.current) return
    const prev = drafts[drafts.length - 1]
    const next = createFillDraft({
      recordDate: prev?.recordDate ?? todayLocalISO(),
      answers: initialAnswersFromBlockDefaults(blocks, new Set()),
    })
    scrollToKeyRef.current = next.key
    setSaveError(null)
    setDrafts((list) => [...list, next])
    triggerHaptic('medium', { intensity: 1 })
  }

  useEffect(() => {
    const key = scrollToKeyRef.current
    if (!key) return
    const node = entryNodesRef.current.get(key)
    if (!node) return
    scrollToKeyRef.current = null
    node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [drafts])

  useEffect(() => {
    if (!saveError) return
    saveErrorNodeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [saveError])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    blurActiveInputInForm(e.currentTarget)
    if (!deedId || savingRef.current) return
    setValidationAttempted(true)
    setSaveError(null)

    const pending = drafts
    const firstInvalid = pending.find(
      (draft) => !isDraftSubmittable(draft, blocks, hasRequiredBlocks),
    )
    if (firstInvalid) {
      entryNodesRef.current.get(firstInvalid.key)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
      return
    }

    savingRef.current = true
    setSaving(true)
    const savedKeys: string[] = []
    try {
      for (const draft of pending) {
        const sanitized = sanitizedAnswersOf(draft.answers)
        await api.deeds.createRecord(deedId, {
          record_date: draft.recordDate,
          record_time: draft.recordTime,
          answers: Object.keys(sanitized).length ? sanitized : undefined,
        })
        savedKeys.push(draft.key)
      }
      triggerHaptic('success', { intensity: 1 })
      navigate(-1)
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : 'Ошибка сохранения')
      if (savedKeys.length > 0) {
        setDrafts((prev) => {
          const rest = prev.filter((draft) => !savedKeys.includes(draft.key))
          return rest.length > 0 ? rest : prev
        })
        setSaveError(
          'Уже сохранённые записи убраны из формы. Остальные можно отправить ещё раз.',
        )
      } else {
        setSaveError('Не удалось сохранить. Попробуй ещё раз.')
      }
    } finally {
      savingRef.current = false
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
      <Box>
        <AppBar onBack={() => navigate(-1)} backButtonIcon="close" />
        <Text as="p" color="crimson">
          Дело не найдено.
        </Text>
      </Box>
    )
  }

  const multiple = drafts.length > 1

  return (
    <Box className={layoutStyles.pageContainer}>
      <form onSubmit={handleSubmit}>
        <Flex direction="column" gap="3">
          <AppBar
            onBack={() => navigate(-1)}
            backButtonIcon="close"
            title="Добавление"
            actions={
              <IconButton
                size="3"
                radius="full"
                variant="classic"
                type="submit"
                disabled={saving}
                aria-label={
                  saving ? 'Сохранение…' : multiple ? 'Добавить записи' : 'Добавить запись'
                }
              >
                <Check size={16} />
              </IconButton>
            }
          />

          <Flex direction="column" gap="4">
            <Card>
              <Flex direction="column" gap="1">
                <Text size="2" weight="medium" as="label">
                  Дело
                </Text>
                <Text size="3">{deed.name}</Text>
              </Flex>
            </Card>

            {drafts.map((draft, index) => (
              <FillFormEntry
                key={draft.key}
                draft={draft}
                index={index}
                multiple={multiple}
                saving={saving}
                blocks={blocks}
                validationAttempted={validationAttempted}
                hasRequiredBlocks={hasRequiredBlocks}
                quickPickNumbersByBlockId={quickPickNumbersByBlockId}
                quickPickSelectIdsByBlockId={quickPickSelectIdsByBlockId}
                onDateChange={setDraftDate}
                onTimeChange={setDraftTime}
                onAnswersChange={updateDraftAnswers}
                onDismissChips={dismissRecentChips}
                onRestoreChips={restoreRecentChips}
                onRemove={removeDraft}
                onEntryNode={setEntryNode}
              />
            ))}

            <Button
              type="button"
              size="3"
              color="gray"
              variant="ghost"
              disabled={saving}
              onClick={addDraft}
            >
              <Plus size={16} />
              Ещё запись
            </Button>

            {saveError && (
              <Box ref={saveErrorNodeRef}>
                <Text as="p" size="2" color="crimson" role="alert">
                  {saveError}
                </Text>
              </Box>
            )}
          </Flex>
        </Flex>
      </form>
    </Box>
  )
}
