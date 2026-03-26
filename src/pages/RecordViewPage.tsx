import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
import { Box, Button, CheckboxGroup, Flex, Heading, IconButton, RadioGroup, Select, SegmentedControl, Separator, Text, TextArea, TextField, Badge } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import { FillFormNumberStepper } from '@/components/FillFormNumberStepper'
import { PageLoading } from '@/components/PageLoading'
import { ArrowTopLeftIcon, BackpackIcon, CheckIcon, Pencil1Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { api } from '@/lib/api'
import type { BlockConfig, BlockRow, DeedWithBlocks, RecordAnswerRow, RecordWithAnswers, ValueJson } from '@/types/database'
import { DatePicker } from '@/components/DatePicker'
import { DurationInput } from '@/components/DurationInput'
import { formatAnswer } from '@/lib/format-utils'
import { blurInputOnEnter } from '@/lib/ios-input-blur'
import scaleSegmentedStyles from '@/components/ScaleSegmentedControl.module.css'
import layoutStyles from '@/styles/layout.module.css'
import styles from './RecordViewPage.module.css'

function getBlockOptions(block: BlockRow): { id: string; label: string }[] {
  const fromConfig = (block.config as BlockConfig | null)?.options
  if (fromConfig?.length) return fromConfig.map((o) => ({ id: o.id, label: o.label }))
  return []
}

type ConfigVersionData = { scale?: { divisions: number; labels: (string | null)[] }; options?: { id: string; label: string; sort_order: number }[] }

function isConfigOutdated(block: BlockRow | null, versionConfig: ConfigVersionData | null): boolean {
  if (!block) return true
  if (!versionConfig) return false
  const cfg = block.config as BlockConfig | null
  if (versionConfig.scale) {
    const d = Math.min(10, Math.max(1, Number(cfg?.divisions ?? 5)))
    const curr = (cfg?.labels ?? []).slice(0, d)
    const vers = versionConfig.scale.labels
    if (Number(versionConfig.scale.divisions) !== d || curr.length !== vers.length) return true
    return !curr.every((c, i) => (c ?? '') === (vers[i] ?? ''))
  }
  if (versionConfig.options) {
    const current = getBlockOptions(block)
    if (current.length !== versionConfig.options.length) return true
    return !versionConfig.options.every((o, i) => current[i]?.id === o.id && current[i]?.label === o.label)
  }
  return false
}

function formatScaleConfig(cfg: ConfigVersionData['scale']): string {
  if (!cfg) return ''
  const parts: string[] = [String(cfg.divisions)]
  const first = cfg.labels[0] ?? ''
  const last = cfg.labels[cfg.divisions - 1] ?? ''
  if (first || last) parts.push(`${first || '…'} — ${last || '…'}`)
  return parts.join(' · ')
}

/** Сравнение ответа блока со снимком при открытии правки (для «Сбросить»). */
function valueJsonEqual(a: ValueJson | undefined, b: ValueJson | undefined): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

/** Ответы из сущности записи — единый источник с сервера для просмотра и отката без сохранения. */
function answersFromRecord(rec: RecordWithAnswers): Record<string, ValueJson> {
  const ans: Record<string, ValueJson> = {}
  for (const a of rec.record_answers ?? []) ans[a.block_id] = a.value_json
  return ans
}

export function RecordViewPage() {
  const { id: recordId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const fromHistory = (location.state as { from?: string } | null)?.from === 'history'
  const [record, setRecord] = useState<RecordWithAnswers | null>(null)
  const [deed, setDeed] = useState<DeedWithBlocks | null>(null)
  const [configByVersion, setConfigByVersion] = useState<Record<string, ConfigVersionData>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [recordDate, setRecordDate] = useState('')
  const [recordTime, setRecordTime] = useState('')
  const [answers, setAnswers] = useState<Record<string, ValueJson>>({})
  /**
   * Снимок ответов на момент входа в правку — для «Сбросить» по блоку и для dirty.
   * Дата/время при «Назад» без сохранения берём из `record` (последний fetch/save), а не из снимка.
   */
  const [editAnswersBaseline, setEditAnswersBaseline] = useState<Record<string, ValueJson> | null>(null)
  const [updateDraft, setUpdateDraft] = useState<Record<string, ValueJson>>({})
  const [savingOutdated, setSavingOutdated] = useState(false)

  useEffect(() => {
    if (!recordId) return
    let cancelled = false
    setLoading(true)
    api.records
      .get(recordId)
      .then((rec) => {
        if (!rec || cancelled) return
        setRecord(rec)
        setRecordDate(rec.record_date)
        setRecordTime(rec.record_time?.slice(0, 5) ?? '')
        setAnswers(answersFromRecord(rec))
        return rec
      })
      .then(async (rec) => {
        if (!rec || cancelled) return
        const deedId = rec.deed_id
        const [d, configMap] = await Promise.all([
          api.deeds.get(deedId, { includeDeletedBlocks: true }),
          (() => {
            const ids = (rec.record_answers ?? [])
              .map((a) => (a as RecordAnswerRow & { config_version_id?: string | null }).config_version_id)
              .filter((v): v is string => !!v)
            return ids.length ? api.records.getConfigForVersions(ids) : Promise.resolve({})
          })(),
        ])
        if (!cancelled && d) setDeed(d)
        if (!cancelled) setConfigByVersion(configMap)
      })
      .catch((e) => {
        if (!cancelled) {
          console.error(e?.message ?? 'Ошибка загрузки записи')
          navigate('/', { replace: true })
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [recordId, navigate])

  const blocks = deed?.blocks ?? []
  const blocksById = Object.fromEntries((deed?.blocks ?? []).map((b) => [b.id, b]))
  const answersByBlockId = record?.record_answers?.reduce(
    (acc, a) => ({ ...acc, [a.block_id]: a }),
    {} as Record<string, RecordAnswerRow & { config_version_id?: string | null }>,
  ) ?? {}

  const outdatedAnswers = (() => {
    const outdated: { block: BlockRow | null; ans: RecordAnswerRow; title: string; optionsOverride?: { id: string; label: string }[] }[] = []
    for (const a of record?.record_answers ?? []) {
      const ans = a as RecordAnswerRow & { config_version_id?: string | null }
      const block = blocksById[ans.block_id] ?? null
      const versionConfig = ans.config_version_id ? configByVersion[ans.config_version_id] : null
      const blockDeleted = block?.deleted_at != null
      const out = !block || blockDeleted || isConfigOutdated(block, versionConfig)
      const optionsOverride = versionConfig?.options?.map((o) => ({ id: o.id, label: o.label }))
      const title = block?.title ?? 'Блок'
      if (out) outdated.push({ block, ans, title, optionsOverride })
    }
    return outdated
  })()

  async function handleSave() {
    if (!recordId || !record) return
    setSaving(true)
    try {
      await api.records.update(recordId, { record_date: recordDate, record_time: recordTime, answers })
      const updated = await api.records.get(recordId)
      if (updated) {
        setRecord(updated)
        setAnswers(answersFromRecord(updated))
        const versionIds = (updated.record_answers ?? [])
          .map((a) => (a as RecordAnswerRow & { config_version_id?: string | null }).config_version_id)
          .filter((v): v is string => !!v)
        const configMap = versionIds.length ? await api.records.getConfigForVersions(versionIds) : {}
        setConfigByVersion(configMap)
      }
      setEditAnswersBaseline(null)
      setEditing(false)
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  /** Текущее значение блока отличается от снимка при открытии формы правки. */
  function isEditBlockDirty(blockId: string): boolean {
    if (!editAnswersBaseline) return false
    return !valueJsonEqual(answers[blockId], editAnswersBaseline[blockId])
  }

  /** Вернуть один блок к значению из снимка (или убрать ключ, если ответа не было). */
  function resetEditBlock(blockId: string) {
    if (!editAnswersBaseline) return
    setAnswers((prev) => {
      const next = { ...prev }
      const base = editAnswersBaseline[blockId]
      if (base === undefined) delete next[blockId]
      else next[blockId] = structuredClone(base) as ValueJson
      return next
    })
  }

  function setAnswer(blockId: string, value: ValueJson) {
    setAnswers((prev) => ({ ...prev, [blockId]: value }))
  }

  async function handleDelete() {
    if (!recordId) return
    if (!confirm('Удалить запись?')) return
    await api.records.delete(recordId)
    navigate(backLink)
  }

  function getMigratedValue(block: BlockRow, oldVal: ValueJson | undefined): ValueJson | undefined {
    if (!oldVal) return undefined
    const currentOptions = getBlockOptions(block)
    const divisions = Math.min(10, Math.max(1, (block.config as BlockConfig | null)?.divisions ?? 5))
    if (block.block_type === 'single_select' && 'optionId' in oldVal && currentOptions.some((o) => o.id === (oldVal as { optionId?: string }).optionId))
      return { optionId: (oldVal as { optionId: string }).optionId }
    if (block.block_type === 'multi_select' && 'optionIds' in oldVal && Array.isArray((oldVal as { optionIds: string[] }).optionIds)) {
      const ids = (oldVal as { optionIds: string[] }).optionIds.filter((id) => currentOptions.some((o) => o.id === id))
      return ids.length > 0 ? { optionIds: ids } : undefined
    }
    if (block.block_type === 'scale' && 'scaleValue' in oldVal) {
      const n = (oldVal as { scaleValue: number }).scaleValue
      return n >= 1 && n <= divisions ? { scaleValue: n } : undefined
    }
    return undefined
  }

  function isDraftValidForBlock(block: BlockRow, draft: ValueJson | undefined): boolean {
    if (draft == null) return false
    switch (block.block_type) {
      case 'number': {
        // 0 и пустой ввод (через `|| 0` в onChange) считаем незаполненным — как на форме добавления записи.
        const n = (draft as { number?: number }).number
        return typeof n === 'number' && Number.isFinite(n) && n !== 0
      }
      case 'text_short':
      case 'text_paragraph': {
        const t = (draft as { text?: string }).text
        return typeof t === 'string' && t.trim().length > 0
      }
      case 'single_select': {
        const id = (draft as { optionId?: string }).optionId
        return typeof id === 'string' && id.length > 0
      }
      case 'multi_select': {
        const ids = (draft as { optionIds?: string[] }).optionIds
        return Array.isArray(ids) && ids.length > 0
      }
      case 'scale': {
        const n = (draft as { scaleValue?: number }).scaleValue
        return typeof n === 'number' && n >= 1
      }
      case 'yes_no':
        return typeof (draft as { yesNo?: boolean }).yesNo === 'boolean'
      case 'duration': {
        const hms = (draft as { durationHms?: string }).durationHms ?? ''
        return hms.length >= 8 && /^\d{2}:\d{2}:\d{2}$/.test(hms)
      }
      default:
        return false
    }
  }

  const nonDeletedBlocks = blocks.filter((b) => !b.deleted_at)
  const unfilledBlocksList = nonDeletedBlocks.filter((block) => !answersByBlockId[block.id])
  const outdatedBlocksList = nonDeletedBlocks.filter((block) => {
    const ans = answersByBlockId[block.id] as (RecordAnswerRow & { config_version_id?: string | null }) | undefined
    const versionConfig = ans?.config_version_id ? configByVersion[ans.config_version_id] : null
    return !!(ans && isConfigOutdated(block, versionConfig))
  })
  const hasOutdatedBlocks = outdatedBlocksList.length > 0
  const hasUnfilledBlocks = unfilledBlocksList.length > 0
  const hasBlocksToUpdate = hasOutdatedBlocks || hasUnfilledBlocks
  const hasAnyValidDraft =
    (hasOutdatedBlocks &&
      outdatedBlocksList.some((block) => {
        const value = answersByBlockId[block.id]?.value_json
        const effectiveDraft = updateDraft[block.id] ?? getMigratedValue(block, value as ValueJson | undefined)
        return isDraftValidForBlock(block, effectiveDraft)
      })) ||
    (hasUnfilledBlocks && unfilledBlocksList.some((block) => isDraftValidForBlock(block, updateDraft[block.id])))

  async function handleUpdateAllOutdated() {
    if (!recordId || !record) return
    const currentAnswers: Record<string, ValueJson> = {}
    for (const a of record.record_answers ?? []) currentAnswers[a.block_id] = a.value_json
    const merged = { ...currentAnswers }
    const toSave: string[] = []
    for (const block of outdatedBlocksList) {
      const value = answersByBlockId[block.id]?.value_json as ValueJson | undefined
      const effectiveDraft = updateDraft[block.id] ?? getMigratedValue(block, value)
      if (!isDraftValidForBlock(block, effectiveDraft)) continue
      merged[block.id] = effectiveDraft
      toSave.push(block.id)
    }
    for (const block of unfilledBlocksList) {
      const draft = updateDraft[block.id]
      if (!isDraftValidForBlock(block, draft)) continue
      merged[block.id] = draft!
      toSave.push(block.id)
    }
    if (toSave.length === 0) return
    setSavingOutdated(true)
    try {
      await api.records.update(recordId, { answers: merged })
      const updated = await api.records.get(recordId)
      if (updated) {
        setRecord(updated)
        setAnswers(answersFromRecord(updated))
        const versionIds = (updated.record_answers ?? [])
          .map((a) => (a as RecordAnswerRow & { config_version_id?: string | null }).config_version_id)
          .filter((v): v is string => !!v)
        const configMap = versionIds.length ? await api.records.getConfigForVersions(versionIds) : {}
        setConfigByVersion(configMap)
      }
      setUpdateDraft((prev) => {
        const next = { ...prev }
        for (const id of toSave) delete next[id]
        return next
      })
    } catch (err: unknown) {
      console.error(err instanceof Error ? err.message : 'Ошибка актуализации')
    } finally {
      setSavingOutdated(false)
    }
  }

  function setUpdateDraftValue(blockId: string, value: ValueJson) {
    setUpdateDraft((prev) => ({ ...prev, [blockId]: value }))
  }

  /** Убрать черновик блока — снова показываются значение по умолчанию / миграция с сохранённого ответа */
  function clearUpdateDraft(blockId: string) {
    setUpdateDraft((prev) => {
      const next = { ...prev }
      delete next[blockId]
      return next
    })
  }

  if (loading) {
    return <PageLoading title="" titleReserve actionsReserveCount={4} />
  }

  const backLink = fromHistory ? '/history' : (record?.deed_id ? `/deeds/${record.deed_id}` : '/')

  if (!record) {
    return (
      <Box p="4">
        <AppBar backHref={backLink} />
        <Text as="p" color="crimson" mt="2">
          Запись не найдена.
        </Text>
      </Box>
    )
  }

  return (
    <Box className={layoutStyles.pageContainer} >
      <AppBar
        backHref={editing ? undefined : backLink}
        onBack={
          editing
            ? () => {
                // Состояние формы = последняя запись с сервера (`record`), а не черновик в state.
                setAnswers(answersFromRecord(record))
                setRecordDate(record.record_date)
                setRecordTime(record.record_time?.slice(0, 5) ?? '')
                setEditAnswersBaseline(null)
                setEditing(false)
              }
            : undefined
        }
        backButtonIcon={editing ? 'close' : 'arrow'}
        title={editing ? 'Редактирование' : 'Запись'}
        actions={
          editing ? (
            <IconButton
              variant="classic"
              radius="full"
              size="3"
              disabled={saving}
              onClick={handleSave}
              aria-label={saving ? 'Сохранение…' : 'Сохранить'}
            >
              <CheckIcon width={18} height={18} />
            </IconButton>
          ) : (
            <>
              {/* Новая запись по тому же делу (например, после просмотра похожей записи) */}
              <IconButton asChild 
              variant="soft" 
              color="gray"
              radius="full" 
              size="3" 
              aria-label="Добавить запись">
                <Link to={`/deeds/${record.deed_id}/fill`}>
                  <PlusIcon width={18} height={18} />
                </Link>
              </IconButton>
              <Separator orientation="vertical" />
              {/* К делу — только если открыли запись с вкладки «История» (state.from === 'history') */}
              {fromHistory && (
                <>
                  <IconButton
                    variant="soft"
                    color="gray"
                    radius="full"
                    size="3"
                    onClick={() => navigate(`/deeds/${record.deed_id}`)}
                    aria-label="Перейти к делу"
                  >
                    <BackpackIcon width={18} height={18} />
                  </IconButton>
                  <Separator orientation="vertical" />
                </>
              )}

              <IconButton
                variant="classic"
                color="gray"
                radius="full"
                size="3"
                onClick={() => {
                  setEditAnswersBaseline(structuredClone(answers))
                  setEditing(true)
                }}
                aria-label="Редактировать"
              >
                <Pencil1Icon width={18} height={18} />
              </IconButton>

              <IconButton
                variant="classic"
                color="red"
                radius="full"
                size="3"
                onClick={handleDelete}
                aria-label="Удалить"
              >
                <TrashIcon width={18} height={18} />
              </IconButton>

              {/* Актуализировать — только в режиме просмотра при устаревших блоках */}
              {hasBlocksToUpdate && (
                <>
                  <Separator orientation="vertical" size="1" />
                  <IconButton
                    variant="classic"
                    color="indigo"
                    radius="full"
                    size="3"
                    disabled={!hasAnyValidDraft || savingOutdated}
                    onClick={handleUpdateAllOutdated}
                    aria-label={savingOutdated ? 'Сохранение…' : 'Актуализировать'}
                  >
                    <CheckIcon width={18} height={18} />
                  </IconButton>
                </>
              )}
            </>
          )
        }
      />

      {editing ? (
        <Flex direction="column" gap="4">

          <Flex direction="column" gap="1">
            <Text size="2" weight="medium" as="label" htmlFor="deed">Дело</Text>
            <Text size="3">{deed?.name}</Text>
          </Flex>

          <Flex gap="3" wrap="wrap">
            <Flex direction="column" gap="1">
              <Text size="2" weight="medium" as="label" htmlFor="date">Дата</Text>
              <DatePicker value={recordDate} onChange={setRecordDate} />
            </Flex>

            <Flex direction="column" gap="1">
              <Text size="2" weight="medium" as="label" htmlFor="time">Время</Text>
              <TextField.Root
                size="3"
                type="time"
                value={recordTime}
                onChange={(e) => setRecordTime(e.target.value)}
                onKeyDown={blurInputOnEnter}
              />
            </Flex>
          </Flex>

          {blocks.filter((b) => !b.deleted_at).map((block) => (
            <Flex key={block.id} direction="column" gap="1">
              <Flex direction="row" align="center" gap="3" wrap="wrap">
                <Text size="2" weight="medium">{block.title}</Text>
                {isEditBlockDirty(block.id) && (
                  <Button
                    type="button"
                    size="2"
                    variant="ghost"
                    color="gray"
                    onClick={() => resetEditBlock(block.id)}
                  >
                    Сбросить
                  </Button>
                )}
              </Flex>
              {block.block_type === 'number' && (
                <Flex gap="2" align="center">
                  <TextField.Root
                    style={{ flex: 1 }}
                    size="3"
                    type="text"
                    inputMode="decimal"
                    enterKeyHint="done"
                    autoComplete="off"
                    autoCorrect="off"
                    onKeyDown={blurInputOnEnter}
                    value={
                      (answers[block.id] as { number?: number } | undefined)?.number !== undefined
                        ? String((answers[block.id] as { number?: number }).number)
                        : ''
                    }
                    onChange={(e) => {
                      const raw = e.target.value
                      // Режим редактирования: 0 — осмысленное значение; пустое поле → 0 (см. docs 13).
                      if (raw === '') {
                        setAnswer(block.id, { number: 0 })
                        return
                      }
                      const parsed = Number(raw)
                      if (!Number.isFinite(parsed)) return
                      setAnswer(block.id, { number: Math.max(0, parsed) })
                    }}
                  />
                  <FillFormNumberStepper
                    blockId={block.id}
                    value={(answers[block.id] as { number?: number } | undefined)?.number ?? 0}
                    setAnswers={setAnswers}
                    zeroBehavior="storeZero"
                  />
                </Flex>
              )}
              {block.block_type === 'text_short' && (
                <TextField.Root
                  size="3"
                  value={(answers[block.id] as { text?: string } | undefined)?.text ?? ''}
                  onChange={(e) => setAnswer(block.id, { text: e.target.value })}
                  onKeyDown={blurInputOnEnter}
                />
              )}
              {block.block_type === 'text_paragraph' && (
                <TextArea
                  size="3"
                  value={(answers[block.id] as { text?: string } | undefined)?.text ?? ''}
                  onChange={(e) => setAnswer(block.id, { text: e.target.value })}
                />
              )}
              {block.block_type === 'single_select' && (
                <Select.Root
                  // После сброса Radix Select может не обновить триггер — key как у актуализации.
                  key={`${block.id}-edit-ss-${isEditBlockDirty(block.id) ? 'd' : 's'}-${(answers[block.id] as { optionId?: string } | undefined)?.optionId ?? 'none'}`}
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
                  key={`${block.id}-edit-ms-${isEditBlockDirty(block.id) ? 'd' : 's'}`}
                  size="3"
                  value={
                    (answers[block.id] as { optionIds?: string[] } | undefined)?.optionIds ?? []
                  }
                  onValueChange={(nextValues) => {
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
                  key={`${block.id}-edit-scale-${isEditBlockDirty(block.id) ? 'd' : 's'}`}
                  value={
                    (answers[block.id] as { scaleValue?: number } | undefined)?.scaleValue?.toString()
                  }
                  onValueChange={(v) => setAnswer(block.id, { scaleValue: Number(v) })}
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
                <RadioGroup.Root
                  key={`${block.id}-edit-yn-${isEditBlockDirty(block.id) ? 'd' : 's'}`}
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
            </Flex>
          ))}
        </Flex>
      ) : (
        <Flex direction="column" gap="4" >

          <Box>
            <Text size="3" color="gray" weight="medium">Дело</Text>
            <Text as="p" size="3">{deed?.name}</Text>
          </Box>

          <Box>
            <Text size="3" color="gray" weight="medium">Дата</Text>
            <Text as="p" size="3">{record.record_date} {record.record_time?.slice(0, 5)}</Text>
          </Box>

          {blocks.filter((b) => !b.deleted_at).map((block) => {
            const ans = answersByBlockId[block.id] as (RecordAnswerRow & { config_version_id?: string | null }) | undefined
            const versionConfig = ans?.config_version_id ? configByVersion[ans.config_version_id] : null
            const outdated = ans && isConfigOutdated(block, versionConfig)
            const unfilled = !ans
            const value = ans?.value_json
            const optionsOverride = versionConfig?.options?.map((o) => ({ id: o.id, label: o.label }))

            if (!outdated && !unfilled) {
              return (
                <Box key={block.id}>
                  <Text size="3" color="gray" weight="medium">{block.title}</Text>
                  <Text as="p" size="3">{value ? formatAnswer(value, block, optionsOverride) : '—'}</Text>
                </Box>
              )
            }

            const currentOptions = getBlockOptions(block)
            const divisions = Math.min(10, Math.max(1, (block.config as BlockConfig | null)?.divisions ?? 5))
            const oldVal = value as ValueJson | undefined
            const draft = updateDraft[block.id] ?? (unfilled ? undefined : getMigratedValue(block, oldVal))

            return (
              <Box key={block.id}>
                <Text size="3" color="gray" weight="medium">{block.title}{outdated ? ' · Устарело' : unfilled ? ' · Не заполнено' : ''}</Text>
                <Text as="p" size="3">{value ? formatAnswer(value, block, optionsOverride) : '—'}</Text>
                <Flex direction="column" gap="1">
                  <Flex direction="row" align="center" gap="3" wrap="wrap">
                    <Flex direction="row" align="center" gap="1">
                      <ArrowTopLeftIcon />
                      <Text weight="medium" size="2">Обнови блок</Text>
                    </Flex>
                    {updateDraft[block.id] != null && (
                      <Button
                        type="button"
                        size="2"
                        variant="ghost"
                        color="gray"
                        onClick={() => clearUpdateDraft(block.id)}
                      >
                        Сбросить
                      </Button>
                    )}
                  </Flex>
                  {block.block_type === 'number' && (
                    <Flex gap="2" align="center">
                      <TextField.Root
                        style={{ flex: 1 }}
                        size="3"
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="done"
                        autoComplete="off"
                        autoCorrect="off"
                        onKeyDown={blurInputOnEnter}
                        value={
                          (draft as { number?: number } | undefined)?.number !== undefined
                            ? String((draft as { number?: number }).number)
                            : ''
                        }
                        onChange={(e) => {
                          const raw = e.target.value
                          // Как FillForm: пусто / 0 / нечисло → убрать черновик по блоку.
                          if (raw === '') {
                            clearUpdateDraft(block.id)
                            return
                          }
                          const parsed = Number(raw)
                          if (!Number.isFinite(parsed) || parsed === 0) {
                            clearUpdateDraft(block.id)
                            return
                          }
                          setUpdateDraftValue(block.id, { number: Math.max(0, parsed) })
                        }}
                      />
                      <FillFormNumberStepper
                        blockId={block.id}
                        value={(draft as { number?: number } | undefined)?.number ?? 0}
                        setAnswers={setUpdateDraft}
                        zeroBehavior="clearKey"
                      />
                    </Flex>
                  )}
                  {block.block_type === 'text_short' && (
                    <TextField.Root
                      size="3"
                      value={(draft as { text?: string } | undefined)?.text ?? ''}
                      onChange={(e) => setUpdateDraftValue(block.id, { text: e.target.value })}
                      onKeyDown={blurInputOnEnter}
                    />
                  )}
                  {block.block_type === 'text_paragraph' && (
                    <TextArea
                      size="3"
                      value={(draft as { text?: string } | undefined)?.text ?? ''}
                      onChange={(e) => setUpdateDraftValue(block.id, { text: e.target.value })}
                    />
                  )}
                  {block.block_type === 'single_select' && (
                    <Select.Root
                      // Radix Select не всегда сбрасывает отображение при value → undefined после «Сбросить»;
                      // смена key принудительно перемонтирует и показывает placeholder.
                      key={`${block.id}-single-${(updateDraft[block.id] as { optionId?: string } | undefined)?.optionId ?? 'cleared'}`}
                      size="3"
                      value={(draft as { optionId?: string } | undefined)?.optionId || undefined}
                      onValueChange={(v) => setUpdateDraftValue(block.id, { optionId: v })}
                    >
                      <Select.Trigger placeholder="Выберите" />
                      <Select.Content>
                        {currentOptions.map((opt) => (
                          <Select.Item key={opt.id} value={opt.id}>{opt.label}</Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                  )}
                  {block.block_type === 'multi_select' && (
                    <CheckboxGroup.Root
                      size="3"
                      value={
                        (draft as { optionIds?: string[] } | undefined)?.optionIds ?? []
                      }
                      onValueChange={(nextValues) => {
                        flushSync(() => {
                          setUpdateDraftValue(block.id, { optionIds: nextValues })
                        })
                      }}
                    >
                      <Flex direction="column" gap="1">
                        {currentOptions.map((opt) => (
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
                      // Как у Select выше: после «Сбросить» value приходит из миграции, но Radix может
                      // оставить визуально старый сегмент — key синхронизирует с черновиком/сбросом.
                      key={`${block.id}-scale-${updateDraft[block.id] != null ? 'draft' : 'migrated'}`}
                      value={
                        (draft as { scaleValue?: number } | undefined)?.scaleValue?.toString()
                      }
                      onValueChange={(v) => setUpdateDraftValue(block.id, { scaleValue: Number(v) })}
                      size={{ initial: '1', sm: '3' }}
                    >
                      {Array.from({ length: divisions }, (_, i) => i + 1).map((n) => (
                        <SegmentedControl.Item key={n} value={String(n)}>
                          {n}
                        </SegmentedControl.Item>
                      ))}
                    </SegmentedControl.Root>
                  )}
                  {block.block_type === 'duration' && (
                    <DurationInput
                      value={(draft as { durationHms?: string } | undefined)?.durationHms ?? ''}
                      onChange={(hms) => setUpdateDraftValue(block.id, { durationHms: hms })}
                      placeholder="00:00:00"
                    />
                  )}
                  {block.block_type === 'yes_no' && (
                    <RadioGroup.Root
                      size="3"
                      value={
                        (draft as { yesNo?: boolean } | undefined)?.yesNo === true
                          ? 'true'
                          : (draft as { yesNo?: boolean } | undefined)?.yesNo === false
                            ? 'false'
                            : ''
                      }
                      onValueChange={(v) => setUpdateDraftValue(block.id, { yesNo: v === 'true' })}
                    >
                      <Flex gap="4">
                        <Text as="label" size="2" className={styles.checkboxLabel}>
                          <RadioGroup.Item value="true" />
                          Да
                        </Text>
                        <Text as="label" size="2" className={styles.checkboxLabel}>
                          <RadioGroup.Item value="false" />
                          Нет
                        </Text>
                      </Flex>
                    </RadioGroup.Root>
                  )}
                </Flex>
              </Box>
            )
          })}
          {outdatedAnswers.filter(({ block }) => block?.deleted_at != null).length > 0 && (
            <>
              {/* <Badge size="3">Удалённые блоки</Badge> */}
              {outdatedAnswers
                .filter(({ block }) => block?.deleted_at != null)
                .map(({ block, ans, title, optionsOverride }) => {
                  const versionConfig = (ans as RecordAnswerRow & { config_version_id?: string | null }).config_version_id
                    ? configByVersion[(ans as RecordAnswerRow & { config_version_id?: string | null }).config_version_id!]
                    : null
                  const scaleConfig = versionConfig?.scale
                  const configStr = scaleConfig ? formatScaleConfig(scaleConfig) : null
                  return (
                    <Flex direction="column" gap="1" key={ans.id}>
                      <Flex direction="row" align="center" gap="2" wrap="wrap"> 
                        <Text weight="medium" size="3" color="gray">{title}</Text>
                        <Badge size="2" color="red" variant="surface">Удалено</Badge>
                      </Flex>
                      <Flex direction="row" align="center" gap="2" wrap="wrap">
                        <Text as="p" size="3">{ans.value_json ? formatAnswer(ans.value_json, block ?? ({} as BlockRow), optionsOverride) : '—'}</Text>
                        <Text size="3" color="gray">·</Text>
                        {configStr && <Text as="p" size="3">Раньше было от 1 до {configStr}</Text>}
                      </Flex>
                    </Flex>
                  )
                })}

            </>
          )}
        </Flex>
      )}
    </Box>
  )
}
