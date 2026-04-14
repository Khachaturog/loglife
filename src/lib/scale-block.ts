import type { BlockConfig } from '@/types/database'

const SCALE_MIN = 1
const SCALE_MAX = 10

/** Число делений 1–10, как в формах записи. */
export function clampScaleDivisions(config: BlockConfig | null | undefined): number {
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, config?.divisions ?? 5))
}

/**
 * Есть ли хотя бы одна непустая подпись среди первых `divisions` делений (после trim).
 * Если нет — строку под шкалой не показываем.
 */
export function scaleHasAnyLabels(config: BlockConfig | null | undefined, divisions: number): boolean {
  const labels = config?.labels
  if (!labels?.length) return false
  for (let i = 0; i < divisions; i++) {
    if ((labels[i] ?? '').trim() !== '') return true
  }
  return false
}

/**
 * Текст под шкалой: null = не рендерить блок (нет ни одной подписи в конфиге).
 * Иначе — «Выберите значение», подпись деления или число как fallback.
 */
export function getScaleDivisionCaption(
  config: BlockConfig | null | undefined,
  divisions: number,
  scaleValue: number | undefined,
): string | null {
  if (!scaleHasAnyLabels(config, divisions)) return null
  if (scaleValue === undefined || !Number.isFinite(scaleValue)) {
    return 'Выберите значение'
  }
  const n = Math.floor(Number(scaleValue))
  if (n < 1 || n > divisions) return 'Выберите значение'
  const trimmed = (config?.labels?.[n - 1] ?? '').trim()
  return trimmed !== '' ? trimmed : String(n)
}

/** Строка для просмотра/CSV: при заданной подписи — «n — подпись», иначе число. */
export function formatScaleAnswerForDisplay(
  config: BlockConfig | null | undefined,
  scaleValue: number,
): string {
  const divisions = clampScaleDivisions(config)
  const n = Math.floor(scaleValue)
  if (n < 1 || n > divisions) return String(scaleValue)
  if (!scaleHasAnyLabels(config, divisions)) return String(n)
  const trimmed = (config?.labels?.[n - 1] ?? '').trim()
  return trimmed !== '' ? `${n} — ${trimmed}` : String(n)
}
