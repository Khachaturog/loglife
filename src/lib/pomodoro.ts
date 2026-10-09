/** 25 минут — стартовый дефолт, пока пользователь не сохранил свой. */
export const POMODORO_DEFAULT_FOCUS_SECONDS = 25 * 60
/** Линейка минут: от 1 до 180. */
export const POMODORO_MIN_FOCUS_SECONDS = 60
export const POMODORO_MAX_FOCUS_SECONDS = 180 * 60
/** Сеанс короче этого плана в базу не пишется. */
export const POMODORO_MIN_RECORDED_SECONDS = 5 * 60
/** Поле эмодзи, когда проект не выбран. */
export const POMODORO_FALLBACK_EMOJI = '🍅'
export const POMODORO_FREE_LABEL = 'Без проекта'

const ACTIVE_KEY = 'loglife.pomodoro.active'
const SELECTION_KEY = 'loglife.pomodoro.selection'
const FREE_SELECTION = 'free'

export type PomodoroActiveSession = {
  projectId: string | null
  plannedSeconds: number
  startedAtMs: number
}

/** Минуты линейки → секунды в допустимом диапазоне. */
export function clampFocusSeconds(seconds: number): number {
  const rounded = Math.round(seconds / 60) * 60
  return Math.min(POMODORO_MAX_FOCUS_SECONDS, Math.max(POMODORO_MIN_FOCUS_SECONDS, rounded || POMODORO_MIN_FOCUS_SECONDS))
}

/** Часы таймера: минуты могут быть больше 59 (180:00). */
export function formatFocusClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Короткая сумма фокуса для подписи на таймере. */
export function formatFocusSum(totalSeconds: number): string {
  const minutes = Math.round(Math.max(0, totalSeconds) / 60)
  if (minutes < 60) return `${minutes} мин`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`
}

/** Тёмный или светлый текст поверх заливки проекта. */
export function textOnAccent(hex: string): '#111111' | '#ffffff' {
  const n = hex.trim().replace('#', '')
  if (!/^[0-9A-Fa-f]{6}$/.test(n)) return '#ffffff'
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? '#111111' : '#ffffff'
}

export function readActiveSession(): PomodoroActiveSession | null {
  try {
    const raw = localStorage.getItem(ACTIVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PomodoroActiveSession>
    if (
      typeof parsed.plannedSeconds !== 'number' ||
      typeof parsed.startedAtMs !== 'number' ||
      !Number.isFinite(parsed.plannedSeconds) ||
      !Number.isFinite(parsed.startedAtMs)
    ) {
      return null
    }
    return {
      projectId: typeof parsed.projectId === 'string' ? parsed.projectId : null,
      plannedSeconds: parsed.plannedSeconds,
      startedAtMs: parsed.startedAtMs,
    }
  } catch {
    return null
  }
}

export function writeActiveSession(session: PomodoroActiveSession | null): void {
  if (!session) {
    localStorage.removeItem(ACTIVE_KEY)
    return
  }
  localStorage.setItem(ACTIVE_KEY, JSON.stringify(session))
}

/** null — режим без проекта. */
export function readSelectedProjectId(): string | null {
  const raw = localStorage.getItem(SELECTION_KEY)
  if (!raw || raw === FREE_SELECTION) return null
  return raw
}

export function writeSelectedProjectId(projectId: string | null): void {
  localStorage.setItem(SELECTION_KEY, projectId ?? FREE_SELECTION)
}
