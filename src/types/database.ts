export type BlockType =
  | 'number'
  | 'text_paragraph'
  | 'single_select'
  | 'multi_select'
  | 'scale'
  | 'yes_no'
  | 'duration'

/** Значение ответа в записи и в `blocks.default_value`. */
export type ValueJson =
  | { number: number }
  | { text: string }
  | { optionId: string }
  | { optionIds: string[] }
  | { scaleValue: number }
  | { yesNo: boolean }
  | { durationHms: string }

export interface BlockRow {
  id: string
  deed_id: string
  sort_order: number
  title: string
  block_type: BlockType
  is_required: boolean
  /** Черновик значения; подстановка на новой записи зависит от `default_value_enabled`. */
  default_value: ValueJson | null
  /** Подставлять `default_value` при открытии формы новой записи. */
  default_value_enabled: boolean
  /** Чипы недавних значений на FillForm (number / single_select). */
  recent_suggestions_enabled: boolean
  config: BlockConfig | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/** Как показывать «Один из списка» при вводе (FillForm, редактирование на RecordView). Просмотр — всегда текст. */
export type SingleSelectUiMode = 'select' | 'checkbox'

export interface BlockConfig {
  /**
   * Для шкалы: количество делений (1–10) и подписи делений.
   * labels[0] = первое деление, labels[divisions-1] = последнее.
   */
  divisions?: number
  labels?: (string | null)[]
  /**
   * Для списков: варианты.
   * id используется как optionId в value_json.
   */
  options?: {
    id: string
    label: string
    sort_order: number
  }[]
  /** Только для block_type === 'single_select'. В БД после миграции всегда задано для таких блоков. */
  singleSelectUi?: SingleSelectUiMode
}

/** Версия конфига блока (родительская таблица). */
export interface BlockConfigVersionRow {
  id: string
  block_id: string
  block_type: 'scale' | 'single_select' | 'multi_select'
  created_at: string
}

/** Версия конфига шкалы (подписи по делениям label_1…label_N). */
export interface BlockConfigScaleVersionRow {
  id: string
  block_id: string
  divisions: number
  label_1: string | null
  label_2: string | null
  label_3: string | null
  label_4: string | null
  label_5: string | null
  label_6: string | null
  label_7: string | null
  label_8: string | null
  label_9: string | null
  label_10: string | null
  created_at: string
}

/** Вариант выбора в версии конфига (одна строка = один option). */
export interface BlockConfigSelectOptionVersionRow {
  id: string
  config_version_id: string
  block_id: string
  option_id: string
  label: string
  sort_order: number
  created_at: string
}

import type { DeedAnalyticsConfigV1 } from '@/types/deed-analytics-config'

export interface DeedRow {
  id: string
  user_id: string
  emoji: string
  name: string
  description: string | null
  category: string | null
  card_color: string | null
  /** Настройки отображения аналитики на карточке дела; null/отсутствует = дефолты в приложении. */
  analytics_config?: DeedAnalyticsConfigV1 | null
  /** Короткое «+» создаёт запись с дефолтами блоков (если у всех блоков заданы валидные дефолты). */
  quick_add_defaults_enabled?: boolean
  created_at: string
  updated_at: string
  blocks?: BlockRow[]
}

export interface RecordRow {
  id: string
  deed_id: string
  record_date: string
  record_time: string
  created_at: string
  updated_at: string
}

export interface RecordAnswerRow {
  id: string
  record_id: string
  block_id: string
  value_json: ValueJson
  config_version_id: string | null
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      deeds: {
        Row: DeedRow
        Insert: Omit<DeedRow, 'created_at' | 'updated_at'>
        Update: Partial<Omit<DeedRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
      }
      blocks: {
        Row: BlockRow
        Insert: Omit<BlockRow, 'created_at' | 'updated_at'>
        Update: Partial<Omit<BlockRow, 'id' | 'deed_id' | 'created_at' | 'updated_at'>>
      }
      block_config_versions: {
        Row: BlockConfigVersionRow
        Insert: Omit<BlockConfigVersionRow, 'created_at'>
        Update: never
      }
      block_config_select_option_versions: {
        Row: BlockConfigSelectOptionVersionRow
        Insert: Omit<BlockConfigSelectOptionVersionRow, 'created_at'>
        Update: never
      }
      block_config_scale_versions: {
        Row: BlockConfigScaleVersionRow
        Insert: Omit<BlockConfigScaleVersionRow, 'created_at'>
        Update: never
      }
      records: {
        Row: RecordRow
        Insert: Omit<RecordRow, 'created_at' | 'updated_at'>
        Update: Partial<Omit<RecordRow, 'id' | 'deed_id' | 'created_at' | 'updated_at'>>
      }
      record_answers: {
        Row: RecordAnswerRow
        Insert: Omit<RecordAnswerRow, 'created_at' | 'updated_at'>
        Update: Partial<Omit<RecordAnswerRow, 'id' | 'record_id' | 'created_at' | 'updated_at'>>
      }
    }
  }
}

export type DeedWithBlocks = DeedRow & { blocks?: BlockRow[] }
export type RecordWithAnswers = RecordRow & { record_answers?: RecordAnswerRow[] }
