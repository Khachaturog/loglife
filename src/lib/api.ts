import { supabase } from '@/lib/supabase'
import type {
  BlockConfig,
  DeedRow,
  DeedWithBlocks,
  BlockRow,
  RecordRow,
  RecordWithAnswers,
  RecordAnswerRow,
  ValueJson,
} from '@/types/database'
import type { DeedAnalyticsConfigV1 } from '@/types/deed-analytics-config'
import { omitOptionalEmptyTextFromRecordAnswers } from '@/lib/block-default-value'

function getBlockOptions(block: BlockRow): { id: string; label: string; sort_order: number }[] {
  const fromConfig = (block.config as BlockConfig | null)?.options
  if (fromConfig?.length) return fromConfig.map((o) => ({ id: o.id, label: o.label, sort_order: o.sort_order ?? 0 }))
  return []
}

async function findOrCreateConfigVersion(block: BlockRow): Promise<string | null> {
  const bt = block.block_type
  if (bt !== 'scale' && bt !== 'single_select' && bt !== 'multi_select') return null

  if (bt === 'scale') {
    const cfg = block.config as BlockConfig | null
    const divisions = Math.min(10, Math.max(1, cfg?.divisions ?? 5))
    const raw = cfg?.labels ?? []
    const labels: (string | null)[] = Array.from({ length: divisions }, (_, i) => raw[i] ?? null)
    const labelCols = ['label_1', 'label_2', 'label_3', 'label_4', 'label_5', 'label_6', 'label_7', 'label_8', 'label_9', 'label_10'] as const
    const { data: candidates } = await supabase
      .from('block_config_scale_versions')
      .select('id, label_1, label_2, label_3, label_4, label_5, label_6, label_7, label_8, label_9, label_10')
      .eq('block_id', block.id)
      .eq('divisions', divisions)
    const versionLabels = (r: { label_1: string | null; label_2: string | null; label_3: string | null; label_4: string | null; label_5: string | null; label_6: string | null; label_7: string | null; label_8: string | null; label_9: string | null; label_10: string | null }) =>
      labelCols.slice(0, divisions).map((c) => r[c] ?? null)
    const match = candidates?.find((r) => {
      const vl = versionLabels(r)
      return vl.every((v, i) => (v ?? '') === (labels[i] ?? ''))
    })
    if (match) return match.id
    const { data: inserted } = await supabase
      .from('block_config_versions')
      .insert({ block_id: block.id, block_type: 'scale' })
      .select('id')
      .single()
    if (!inserted?.id) return null
    const payload: Record<string, unknown> = {
      id: inserted.id,
      block_id: block.id,
      divisions,
    }
    labelCols.forEach((col, i) => { payload[col] = labels[i] ?? null })
    await supabase.from('block_config_scale_versions').insert(payload)
    return inserted.id
  }

  const opts = getBlockOptions(block)
  if (opts.length === 0) return null

  const { data: versions } = await supabase
    .from('block_config_versions')
    .select('id')
    .eq('block_id', block.id)
    .eq('block_type', bt)
    .order('created_at', { ascending: false })
  if (!versions?.length) {
    const { data: inserted } = await supabase
      .from('block_config_versions')
      .insert({ block_id: block.id, block_type: bt })
      .select('id')
      .single()
    if (!inserted?.id) return null
    for (const o of opts) {
      await supabase.from('block_config_select_option_versions').insert({
        config_version_id: inserted.id,
        block_id: block.id,
        option_id: o.id,
        label: o.label,
        sort_order: o.sort_order,
      })
    }
    return inserted.id
  }

  for (const v of versions) {
    const { data: vOpts } = await supabase
      .from('block_config_select_option_versions')
      .select('option_id, label, sort_order')
      .eq('config_version_id', v.id)
      .order('sort_order')
    if (!vOpts || vOpts.length !== opts.length) continue
    const match = vOpts.every((vo, i) => vo.option_id === opts[i].id && vo.label === opts[i].label && vo.sort_order === opts[i].sort_order)
    if (match) return v.id
  }

  const { data: inserted } = await supabase
    .from('block_config_versions')
    .insert({ block_id: block.id, block_type: bt })
    .select('id')
    .single()
  if (!inserted?.id) return null
  for (const o of opts) {
    await supabase.from('block_config_select_option_versions').insert({
      config_version_id: inserted.id,
      block_id: block.id,
      option_id: o.id,
      label: o.label,
      sort_order: o.sort_order,
    })
  }
  return inserted.id
}
let cachedUserId: string | null = null

export function setApiUserId(uid: string | null): void {
  cachedUserId = uid
}

/** Дедупликация запросов при двойном монтировании (React StrictMode). */
let inFlightListWithBlocks: Promise<DeedWithBlocks[]> | null = null
const inFlightRecordsByDeedIds = new Map<string, Promise<Record<string, (RecordRow & { record_answers?: RecordAnswerRow[] })[]>>>()

async function getUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const id = session?.user?.id ?? null
  if (id) cachedUserId = id
  return id
}

async function getUserIdOrThrow(): Promise<string> {
  const uid = await getUserId()
  if (!uid) throw new Error('Необходима авторизация')
  return uid
}

export const api = {
  deeds: {
    async list(): Promise<DeedRow[]> {
      const uid = await getUserIdOrThrow()
      const { data, error } = await supabase
        .from('deeds')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
      if (error) {
        console.error(error.message ?? 'Ошибка загрузки дел')
        throw error
      }
      return data ?? []
    },

    /** Список дел с блоками (для главной: нужны типы блоков number/scale для логики N). Дедупликация при StrictMode. */
    async listWithBlocks(): Promise<DeedWithBlocks[]> {
      if (inFlightListWithBlocks) return inFlightListWithBlocks
      const promise = (async () => {
        const uid = await getUserIdOrThrow()
        const { data, error } = await supabase
          .from('deeds')
          .select('*, blocks(*)')
          .eq('user_id', uid)
          .order('created_at', { ascending: false })
        if (error) {
          console.error(error.message ?? 'Ошибка загрузки дел')
          throw error
        }
        const list = (data ?? []) as (DeedRow & { blocks?: BlockRow[] })[]
        for (const deed of list) {
          deed.blocks = (deed.blocks ?? [])
            .filter((b: BlockRow) => !b.deleted_at)
            .sort((a: BlockRow, b: BlockRow) => a.sort_order - b.sort_order)
        }
        return list as DeedWithBlocks[]
      })()
      inFlightListWithBlocks = promise
      promise.finally(() => { inFlightListWithBlocks = null })
      return promise
    },

    async get(id: string, opts?: { includeDeletedBlocks?: boolean }): Promise<DeedWithBlocks | null> {
      const uid = await getUserIdOrThrow()
      const { data, error } = await supabase
        .from('deeds')
        .select('*, blocks(*)')
        .eq('id', id)
        .eq('user_id', uid)
        .single()
      if (error) {
        if (error.code === 'PGRST116') return null
        console.error(error.message ?? 'Ошибка загрузки дела')
        throw error
      }
      if (data?.blocks) {
        const blocks = data.blocks as BlockRow[]
        const filtered = opts?.includeDeletedBlocks ? blocks : blocks.filter(b => !b.deleted_at)
        ;(data as DeedWithBlocks).blocks = filtered.sort((a, b) => a.sort_order - b.sort_order)
      }
      return data as DeedWithBlocks
    },

    async create(payload: {
      emoji?: string
      name?: string
      description?: string
      category?: string | null
      card_color?: string | null
      analytics_config?: DeedAnalyticsConfigV1 | null
      quick_add_defaults_enabled?: boolean
      blocks?: Partial<BlockRow>[]
    }): Promise<DeedRow> {
      const uid = await getUserIdOrThrow()
      const { data: deed, error: deedError } = await supabase
        .from('deeds')
        .insert({
          user_id: uid,
          emoji: payload.emoji ?? '📋',
          name: payload.name ?? 'Новое дело',
          description: payload.description ?? null,
          category: payload.category ?? null,
          card_color: payload.card_color ?? null,
          ...(payload.analytics_config !== undefined && { analytics_config: payload.analytics_config }),
          ...(payload.quick_add_defaults_enabled !== undefined && {
            quick_add_defaults_enabled: payload.quick_add_defaults_enabled,
          }),
        })
        .select()
        .single()
      if (deedError) {
        console.error(deedError.message ?? 'Ошибка создания дела')
        throw deedError
      }
      const blocks = payload.blocks?.length
        ? payload.blocks
        : [
            {
              block_type: 'number' as const,
              title: 'Значение',
              sort_order: 0,
              is_required: false,
              default_value: null,
              default_value_enabled: false,
              recent_suggestions_enabled: true,
              config: null,
            },
          ]
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i]
        await supabase.from('blocks').insert({
          deed_id: deed.id,
          sort_order: b.sort_order ?? i,
          title: b.title ?? 'Блок',
          block_type: b.block_type ?? 'number',
          is_required: b.is_required ?? false,
          default_value: b.default_value ?? null,
          default_value_enabled: b.default_value_enabled ?? false,
          recent_suggestions_enabled: b.recent_suggestions_enabled ?? true,
          config: b.config ?? null,
        })
      }
      return deed
    },

    async update(id: string, payload: {
      emoji?: string
      name?: string
      description?: string
      category?: string | null
      card_color?: string | null
      analytics_config?: DeedAnalyticsConfigV1 | null
      quick_add_defaults_enabled?: boolean
      blocks?: Partial<BlockRow>[]
    }): Promise<void> {
      const uid = await getUserIdOrThrow()
      const now = new Date().toISOString()
      const { error: deedError } = await supabase
        .from('deeds')
        .update({
          ...(payload.emoji !== undefined && { emoji: payload.emoji }),
          ...(payload.name !== undefined && { name: payload.name }),
          ...(payload.description !== undefined && { description: payload.description }),
          ...(payload.category !== undefined && { category: payload.category }),
          ...(payload.card_color !== undefined && { card_color: payload.card_color }),
          ...(payload.analytics_config !== undefined && { analytics_config: payload.analytics_config }),
          ...(payload.quick_add_defaults_enabled !== undefined && {
            quick_add_defaults_enabled: payload.quick_add_defaults_enabled,
          }),
        })
        .eq('id', id)
        .eq('user_id', uid)
      if (deedError) {
        console.error(deedError.message ?? 'Ошибка обновления дела')
        throw deedError
      }
      if (payload.blocks !== undefined) {
        const { data: existing } = await supabase.from('blocks').select('id').eq('deed_id', id)
        const existingIds = new Set((existing ?? []).map(b => b.id))
        const payloadIds = new Set(
          payload.blocks
            .map((b) => (b as BlockRow & { id?: string }).id)
            .filter((v): v is string => !!v),
        )
        for (let i = 0; i < payload.blocks.length; i++) {
          const b = payload.blocks[i] as BlockRow & { id?: string }
          if (b.id && existingIds.has(b.id)) {
            await supabase.from('blocks').update({
              sort_order: i,
              title: b.title,
              block_type: b.block_type,
              is_required: b.is_required,
              default_value: b.default_value ?? null,
              default_value_enabled: b.default_value_enabled ?? false,
              recent_suggestions_enabled: b.recent_suggestions_enabled ?? true,
              config: b.config,
            }).eq('id', b.id)
          } else {
            const { data: inserted } = await supabase.from('blocks').insert({
              deed_id: id,
              sort_order: i,
              title: b.title ?? 'Блок',
              block_type: b.block_type ?? 'number',
              is_required: b.is_required ?? false,
              default_value: b.default_value ?? null,
              default_value_enabled: b.default_value_enabled ?? false,
              recent_suggestions_enabled: b.recent_suggestions_enabled ?? true,
              config: b.config ?? null,
            }).select('id').single()
            if (inserted?.id) existingIds.add(inserted.id)
          }
        }
        if (existing && existing.length > 0) {
          const toSoftDelete = existing.filter((b) => !payloadIds.has(b.id))
          if (toSoftDelete.length > 0) {
            await supabase
              .from('blocks')
              .update({ deleted_at: now })
              .in('id', toSoftDelete.map((b) => b.id))
          }
        }
      }
    },

    async delete(id: string): Promise<void> {
      const uid = await getUserIdOrThrow()
      const { data: deed } = await supabase.from('deeds').select('id').eq('id', id).eq('user_id', uid).single()
      if (!deed) throw new Error('Дело не найдено')

      // Удаляем вручную в порядке зависимостей, т.к. при CASCADE RLS блокирует удаление
      // (политики проверяют наличие дела, которое уже удаляется в той же транзакции).

      const { data: records } = await supabase.from('records').select('id').eq('deed_id', id)
      const recordIds = (records ?? []).map((r) => r.id)
      if (recordIds.length > 0) {
        const { error: answersErr } = await supabase.from('record_answers').delete().in('record_id', recordIds)
        if (answersErr) {
          console.error(answersErr.message ?? 'Ошибка удаления ответов записей')
          throw answersErr
        }
      }

      const { error: recordsErr } = await supabase.from('records').delete().eq('deed_id', id)
      if (recordsErr) {
        console.error(recordsErr.message ?? 'Ошибка удаления записей')
        throw recordsErr
      }

      const { data: blocks } = await supabase.from('blocks').select('id').eq('deed_id', id)
      const blockIds = (blocks ?? []).map((b) => b.id)
      if (blockIds.length > 0) {
        const { data: configVersions } = await supabase.from('block_config_versions').select('id').in('block_id', blockIds)
        const versionIds = (configVersions ?? []).map((v) => v.id)
        if (versionIds.length > 0) {
          const { error: optErr } = await supabase.from('block_config_select_option_versions').delete().in('config_version_id', versionIds)
          if (optErr) throw optErr
          const { error: scaleErr } = await supabase.from('block_config_scale_versions').delete().in('id', versionIds)
          if (scaleErr) throw scaleErr
        }
        const { error: versionsErr } = await supabase.from('block_config_versions').delete().in('block_id', blockIds)
        if (versionsErr) throw versionsErr
      }

      const { error: blocksErr } = await supabase.from('blocks').delete().eq('deed_id', id)
      if (blocksErr) {
        console.error(blocksErr.message ?? 'Ошибка удаления блоков')
        throw blocksErr
      }

      const { error } = await supabase.from('deeds').delete().eq('id', id).eq('user_id', uid)
      if (error) {
        console.error(error.message ?? 'Ошибка удаления дела')
        throw error
      }
    },

    async deleteBlock(deedId: string, blockId: string): Promise<void> {
      const uid = await getUserIdOrThrow()
      const { data: deed } = await supabase.from('deeds').select('id').eq('id', deedId).eq('user_id', uid).single()
      if (!deed) throw new Error('Дело не найдено')
      const now = new Date().toISOString()
      const { error } = await supabase.from('blocks').update({ deleted_at: now }).eq('id', blockId).eq('deed_id', deedId)
      if (error) {
        console.error(error.message ?? 'Ошибка удаления блока')
        throw error
      }
    },

    async records(deedId: string): Promise<(RecordRow & { record_answers?: RecordAnswerRow[] })[]> {
      const uid = await getUserIdOrThrow()
      const { data: deed } = await supabase.from('deeds').select('id').eq('id', deedId).eq('user_id', uid).single()
      if (!deed) return []
      const { data, error } = await supabase
        .from('records')
        .select('*, record_answers(*)')
        .eq('deed_id', deedId)
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false })
      if (error) {
        console.error(error.message ?? 'Ошибка загрузки записей')
        throw error
      }
      return data ?? []
    },

    /** Последние N записей дела с ответами — для подсказок на экране добавления записи (без полной истории). */
    async recentRecords(
      deedId: string,
      limit = 10
    ): Promise<(RecordRow & { record_answers?: RecordAnswerRow[] })[]> {
      const uid = await getUserIdOrThrow()
      const { data: deed } = await supabase.from('deeds').select('id').eq('id', deedId).eq('user_id', uid).single()
      if (!deed) return []
      const { data, error } = await supabase
        .from('records')
        .select('*, record_answers(*)')
        .eq('deed_id', deedId)
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false })
        .limit(limit)
      if (error) {
        console.error(error.message ?? 'Ошибка загрузки последних записей')
        throw error
      }
      return data ?? []
    },

    /** Записи по нескольким делам одним запросом (для главной и истории).
     * @param opts.skipDeedCheck — если true, не проверять deeds (id уже от listWithBlocks); RLS на records всё равно ограничит доступ */
    async recordsByDeedIds(
      deedIds: string[],
      opts?: { skipDeedCheck?: boolean }
    ): Promise<Record<string, (RecordRow & { record_answers?: RecordAnswerRow[] })[]>> {
      if (deedIds.length === 0) return {}
      const cacheKey = deedIds.slice().sort().join(',')
      const inFlight = inFlightRecordsByDeedIds.get(cacheKey)
      if (inFlight) return inFlight

      const promise = (async () => {
        let idsToFetch: string[]
        if (opts?.skipDeedCheck) {
          idsToFetch = deedIds
        } else {
          const uid = await getUserIdOrThrow()
          const { data: deeds } = await supabase.from('deeds').select('id').eq('user_id', uid).in('id', deedIds)
          const allowedIds = new Set((deeds ?? []).map((d) => d.id))
          idsToFetch = deedIds.filter((id) => allowedIds.has(id))
        }
        if (idsToFetch.length === 0) return Object.fromEntries(deedIds.map((id) => [id, []]))

        const { data, error } = await supabase
          .from('records')
          .select('*, record_answers(*)')
          .in('deed_id', idsToFetch)
          .order('record_date', { ascending: false })
          .order('record_time', { ascending: false })
        if (error) {
          console.error(error.message ?? 'Ошибка загрузки записей')
          throw error
        }
        const byId: Record<string, (RecordRow & { record_answers?: RecordAnswerRow[] })[]> = {}
        for (const id of deedIds) byId[id] = []
        for (const r of data ?? []) {
          const list = byId[r.deed_id] ?? []
          list.push(r as RecordRow & { record_answers?: RecordAnswerRow[] })
          byId[r.deed_id] = list
        }
        for (const id of deedIds) {
          (byId[id] ?? []).sort((a, b) => {
            const d = b.record_date.localeCompare(a.record_date)
            if (d !== 0) return d
            return (b.record_time ?? '').toString().localeCompare((a.record_time ?? '').toString())
          })
        }
        return byId
      })()
      inFlightRecordsByDeedIds.set(cacheKey, promise)
      promise.finally(() => { inFlightRecordsByDeedIds.delete(cacheKey) })
      return promise
    },

    /** Все записи по всем делам пользователя с информацией о деле (для истории). */
    async listAllRecordsWithDeedInfo(): Promise<(RecordRow & { record_answers?: RecordAnswerRow[]; deeds?: { emoji: string; name: string; blocks?: BlockRow[] } | null })[]> {
      const uid = await getUserIdOrThrow()
      const { data, error } = await supabase
        .from('records')
        .select('*, record_answers(*), deeds!inner(emoji, name, blocks(*))')
        .eq('deeds.user_id', uid)
        .order('record_date', { ascending: false })
        .order('record_time', { ascending: false })
      if (error) {
        console.error(error.message ?? 'Ошибка загрузки истории')
        throw error
      }
      return (data ?? []) as (RecordRow & { record_answers?: RecordAnswerRow[]; deeds?: { emoji: string; name: string; blocks?: BlockRow[] } | null })[]
    },

    async createRecord(
      deedId: string,
      payload: { record_date: string; record_time: string; answers?: Record<string, ValueJson> }
    ): Promise<RecordRow> {
      const uid = await getUserIdOrThrow()
      const { data: deed } = await supabase.from('deeds').select('id').eq('id', deedId).eq('user_id', uid).single()
      if (!deed) throw new Error('Дело не найдено')
      const { data: record, error: recordError } = await supabase
        .from('records')
        .insert({
          deed_id: deedId,
          record_date: payload.record_date,
          record_time: payload.record_time,
        })
        .select()
        .single()
      if (recordError) {
        console.error(recordError.message ?? 'Ошибка создания записи')
        throw recordError
      }
      if (payload.answers && Object.keys(payload.answers).length > 0) {
        const { data: deedWithBlocks } = await supabase
          .from('deeds')
          .select('*, blocks(*)')
          .eq('id', deedId)
          .eq('user_id', uid)
          .single()
        const blocks = deedWithBlocks?.blocks ?? []
        const answersForInsert = omitOptionalEmptyTextFromRecordAnswers(blocks, payload.answers)
        if (Object.keys(answersForInsert).length === 0) {
          return record
        }
        const inserts: { record_id: string; block_id: string; value_json: ValueJson; config_version_id: string | null }[] = []
        for (const [block_id, value_json] of Object.entries(answersForInsert)) {
          const block = blocks.find((b: BlockRow) => b.id === block_id)
          const config_version_id = block ? await findOrCreateConfigVersion(block) : null
          inserts.push({
            record_id: record.id,
            block_id,
            value_json,
            config_version_id,
          })
        }
        await supabase.from('record_answers').insert(inserts)
      }
      return record
    },
  },

  records: {
    async get(id: string): Promise<RecordWithAnswers | null> {
      const { data: record, error } = await supabase
        .from('records')
        .select('*, record_answers(*)')
        .eq('id', id)
        .single()
      if (error) {
        if (error.code === 'PGRST116') return null
        console.error(error.message ?? 'Ошибка загрузки записи')
        throw error
      }
      // Проверяем владение через явный .eq('user_id', uid) — ownership в запросе, не в JS
      const uid = await getUserIdOrThrow()
      const { data: deed } = await supabase.from('deeds').select('id').eq('id', record.deed_id).eq('user_id', uid).single()
      if (!deed) return null
      return record as RecordWithAnswers
    },

    async update(
      id: string,
      payload: { record_date?: string; record_time?: string; answers?: Record<string, ValueJson> }
    ): Promise<void> {
      const { data: record } = await supabase.from('records').select('deed_id').eq('id', id).single()
      if (!record) throw new Error('Запись не найдена')
      // Проверяем владение через явный .eq('user_id', uid) — ownership в запросе, не в JS
      const uid = await getUserIdOrThrow()
      const { data: deed } = await supabase.from('deeds').select('id').eq('id', record.deed_id).eq('user_id', uid).single()
      if (!deed) throw new Error('Доступ запрещён')
      const { error: recordError } = await supabase
        .from('records')
        .update({
          ...(payload.record_date !== undefined && { record_date: payload.record_date }),
          ...(payload.record_time !== undefined && { record_time: payload.record_time }),
        })
        .eq('id', id)
      if (recordError) {
        console.error(recordError.message ?? 'Ошибка обновления записи')
        throw recordError
      }
      if (payload.answers !== undefined) {
        const { data: deedWithBlocks } = await supabase
          .from('deeds')
          .select('*, blocks(*)')
          .eq('id', record.deed_id)
          .eq('user_id', uid)
          .single()
        const blocks = deedWithBlocks?.blocks ?? []
        const raw = payload.answers
        // Необязательный пустой текст не храним: удаляем существующую строку ответа.
        for (const b of blocks) {
          if (!b.id || b.block_type !== 'text_paragraph' || b.is_required !== false) continue
          const v = raw[b.id]
          if (
            v &&
            typeof v === 'object' &&
            'text' in v &&
            String((v as { text?: string }).text ?? '').trim() === ''
          ) {
            await supabase.from('record_answers').delete().eq('record_id', id).eq('block_id', b.id)
          }
        }
        const answersCleaned = omitOptionalEmptyTextFromRecordAnswers(blocks, raw)
        for (const [block_id, value_json] of Object.entries(answersCleaned)) {
          const block = blocks.find((b: BlockRow) => b.id === block_id)
          const config_version_id = block ? await findOrCreateConfigVersion(block) : null
          const { data: existing } = await supabase.from('record_answers').select('id').eq('record_id', id).eq('block_id', block_id).single()
          if (existing) {
            await supabase.from('record_answers').update({ value_json, config_version_id }).eq('id', existing.id)
          } else {
            await supabase.from('record_answers').insert({
              record_id: id,
              block_id,
              value_json,
              config_version_id,
            })
          }
        }
      }
    },

    /** Конфиг по версиям (для отображения старых записей). */
    async getConfigForVersions(
      ids: string[]
    ): Promise<Record<string, { scale?: { divisions: number; labels: (string | null)[] }; options?: { id: string; label: string; sort_order: number }[] }>> {
      if (ids.length === 0) return {}
      const uniq = [...new Set(ids)]
      const result: Record<string, { scale?: { divisions: number; labels: (string | null)[] }; options?: { id: string; label: string; sort_order: number }[] }> = {}
      const { data: scaleRows } = await supabase.from('block_config_scale_versions').select('id, divisions, label_1, label_2, label_3, label_4, label_5, label_6, label_7, label_8, label_9, label_10').in('id', uniq)
      const labelCols = ['label_1', 'label_2', 'label_3', 'label_4', 'label_5', 'label_6', 'label_7', 'label_8', 'label_9', 'label_10'] as const
      for (const r of scaleRows ?? []) {
        const labels = labelCols.slice(0, r.divisions).map((c) => (r as Record<string, unknown>)[c] as string | null ?? null)
        result[r.id] = { scale: { divisions: r.divisions, labels } }
      }
      const { data: optRows } = await supabase
        .from('block_config_select_option_versions')
        .select('config_version_id, option_id, label, sort_order')
        .in('config_version_id', uniq)
        .order('sort_order')
      for (const r of optRows ?? []) {
        if (!result[r.config_version_id]) result[r.config_version_id] = {}
        if (!result[r.config_version_id].options) result[r.config_version_id].options = []
        result[r.config_version_id].options!.push({ id: r.option_id, label: r.label, sort_order: r.sort_order })
      }
      return result
    },

    async delete(id: string): Promise<void> {
      const { data: record } = await supabase.from('records').select('deed_id').eq('id', id).single()
      if (!record) throw new Error('Запись не найдена')
      // Проверяем владение через явный .eq('user_id', uid) — ownership в запросе, не в JS
      const uid = await getUserIdOrThrow()
      const { data: deed } = await supabase.from('deeds').select('id').eq('id', record.deed_id).eq('user_id', uid).single()
      if (!deed) throw new Error('Доступ запрещён')
      const { error: answersError } = await supabase.from('record_answers').delete().eq('record_id', id)
      if (answersError) {
        console.error(answersError.message ?? 'Ошибка удаления ответов записи')
        throw answersError
      }
      const { error: recordError } = await supabase.from('records').delete().eq('id', id)
      if (recordError) {
        console.error(recordError.message ?? 'Ошибка удаления записи')
        throw recordError
      }
    },
  },
}
