import { useCallback, useEffect, useRef, useState } from 'react'

/** Показ индикатора не раньше чем через SHOW_AFTER_MS (избегаем мигания на быстрых операциях). */
export const DELAYED_ACTION_SHOW_AFTER_MS = 300
/** После появления индикатор держим минимум MIN_VISIBLE_MS. */
export const DELAYED_ACTION_MIN_VISIBLE_MS = 500

/**
 * Оборачивает асинхронное действие: лоадер показывается с задержкой и крутится не меньше MIN_VISIBLE_MS.
 * Promise из `run` завершается только после скрытия индикатора (если он был показан).
 */
export function useDelayedActionLoader() {
  const [spinnerVisible, setSpinnerVisible] = useState(false)
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const shownAtRef = useRef<number | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
    setSpinnerVisible(false)
    shownAtRef.current = null

    delayTimerRef.current = setTimeout(() => {
      if (!mountedRef.current) return
      setSpinnerVisible(true)
      shownAtRef.current = Date.now()
    }, DELAYED_ACTION_SHOW_AFTER_MS)

    try {
      return await action()
    } finally {
      if (delayTimerRef.current) {
        clearTimeout(delayTimerRef.current)
        delayTimerRef.current = null
      }
      const shownAt = shownAtRef.current
      shownAtRef.current = null

      if (shownAt === null) {
        if (mountedRef.current) setSpinnerVisible(false)
      } else {
        const elapsed = Date.now() - shownAt
        const remaining = Math.max(0, DELAYED_ACTION_MIN_VISIBLE_MS - elapsed)
        await new Promise<void>((resolve) => {
          hideTimerRef.current = setTimeout(() => {
            hideTimerRef.current = null
            if (mountedRef.current) setSpinnerVisible(false)
            resolve()
          }, remaining)
        })
      }
    }
  }, [])

  return { spinnerVisible, run }
}
