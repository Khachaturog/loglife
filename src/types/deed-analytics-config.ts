/** Схема v1: настройки блоков аналитики на карточке дела. */
export type DeedAnalyticsConfigV1 = {
  version: 1
  summary: {
    enabled: boolean
    /** uuid блока number | scale | duration; null — первый числовой по sort_order */
    block_id: string | null
    /** Карточки «Сегодня» / «За месяц» / «Всего» в сводке */
    show_today: boolean
    show_month: boolean
    show_total: boolean
  }
  activity: {
    /** Общий переключатель блока «активность по записям» на карточке дела. */
    enabled: boolean
    streak_enabled: boolean
    /** Строка «Максимум» в карточке стрика; только при streak_enabled */
    max_streak_enabled: boolean
    record_count_enabled: boolean
    workday_weekend_enabled: boolean
  }
  heatmap: {
    enabled: boolean
    block_id: string | null
    use_card_color: boolean
    accent_hex: string | null
    show_weekday_labels: boolean
    show_month_labels: boolean
    /** Нижний ряд: «пик» и легенда «Меньше» … «Больше» */
    show_peak_and_legend: boolean
  }
}

export const DEFAULT_DEED_ANALYTICS_CONFIG: DeedAnalyticsConfigV1 = {
  version: 1,
  summary: {
    enabled: true,
    block_id: null,
    show_today: true,
    show_month: true,
    show_total: true,
  },
  activity: {
    enabled: true,
    streak_enabled: true,
    max_streak_enabled: true,
    record_count_enabled: true,
    workday_weekend_enabled: true,
  },
  heatmap: {
    enabled: true,
    block_id: null,
    use_card_color: true,
    accent_hex: null,
    show_weekday_labels: true,
    show_month_labels: true,
    show_peak_and_legend: true,
  },
}
