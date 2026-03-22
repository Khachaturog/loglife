import { useCallback, useEffect, useRef } from 'react'
import { HOLD_DELAY_MS, HOLD_INTERVAL_MS } from '@/lib/hold-repeat-constants'

/**
 * Повтор действия при удержании: первый вызов по pointer down, затем после задержки — интервал.
 * Используется для кнопок ± (форма заполнения, кликер).
 */
export function useHoldRepeat(onTick: () => void) {
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearHoldTimers = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current)
      holdTimeoutRef.current = null
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current)
      holdIntervalRef.current = null
    }
  }, [])

  useEffect(() => () => clearHoldTimers(), [clearHoldTimers])

  const handlePointerDown = useCallback(() => {
    onTickRef.current()
    holdTimeoutRef.current = setTimeout(() => {
      holdTimeoutRef.current = null
      holdIntervalRef.current = setInterval(() => {
        onTickRef.current()
      }, HOLD_INTERVAL_MS)
    }, HOLD_DELAY_MS)
  }, [])

  return { handlePointerDown, handlePointerUp: clearHoldTimers, clearHoldTimers }
}
