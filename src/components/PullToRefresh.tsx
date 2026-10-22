import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Spinner } from '@radix-ui/themes'
import { triggerHaptic } from '@/lib/haptics'
import styles from './PullToRefresh.module.css'

/** Потолок сдвига колонки, px. */
const PULL_MAX_PX = 96
/** Сдвиг, после которого отпускание запускает обновление. */
const PULL_THRESHOLD_PX = 64
/** Высота, на которой спиннер держится, пока идёт запрос. */
const REST_PX = 56
/** Чтобы вспышка на быстром ответе всё равно была видна. */
const MIN_VISIBLE_MS = 400
/** Сдвиг пальца, после которого жест — тяга, а не тап или горизонталь. */
const CLAIM_PX = 10
/** Палец проходит больше, чем сдвигается колонка. */
const RESISTANCE = 0.45
/** Совпадает с transition в CSS: после него transform снимается, иначе sticky-шапка не прилипает. */
const SETTLE_MS = 280

type PullToRefreshProps = {
  /** Повторная загрузка уже открытого экрана. Ошибку гасит сам экран и не стирает данные. */
  onRefresh: () => Promise<void>
  /** Форма, диалог, догрузка — жест не стартует. */
  disabled?: boolean
  children: ReactNode
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return target.closest('input, textarea, select, [contenteditable="true"]') != null
}

/**
 * Тяга вниз у верхнего края окна: колонка с шапкой сдвигается, в зазоре — Spinner.
 * Слушатели на window, потому что эти экраны скроллятся документом, не внутренним блоком.
 * Мышь и трекпад не обрабатываем.
 */
export function PullToRefresh({ onRefresh, disabled = false, children }: PullToRefreshProps) {
  const [offset, setOffset] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [settling, setSettling] = useState(false)
  const offsetRef = useRef(0)
  const refreshingRef = useRef(false)
  const disabledRef = useRef(disabled)
  const onRefreshRef = useRef(onRefresh)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    disabledRef.current = disabled
  }, [disabled])

  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  const setPull = useCallback((next: number) => {
    offsetRef.current = next
    setOffset(next)
  }, [])

  const armSettleEnd = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null
      setSettling(false)
    }, SETTLE_MS)
  }, [])

  useEffect(() => {
    let startY = 0
    let startX = 0
    let phase: 'idle' | 'pending' | 'pull' = 'idle'
    let overscrollRestore: string | null = null
    // Тяга не должна открывать карточку или кнопку, с которой палец начал жест.
    let suppressClick = false
    let suppressTimer: ReturnType<typeof setTimeout> | null = null

    const lockOverscroll = () => {
      if (overscrollRestore != null) return
      overscrollRestore = document.documentElement.style.overscrollBehaviorY
      document.documentElement.style.overscrollBehaviorY = 'none'
    }

    const unlockOverscroll = () => {
      if (overscrollRestore == null) return
      document.documentElement.style.overscrollBehaviorY = overscrollRestore
      overscrollRestore = null
    }

    const releasePull = () => {
      phase = 'idle'
      unlockOverscroll()
    }

    const snapBack = () => {
      setSettling(true)
      setPull(0)
      armSettleEnd()
    }

    const onStart = (event: TouchEvent) => {
      if (disabledRef.current || refreshingRef.current) return
      if (window.scrollY > 0) return
      if (document.body.hasAttribute('data-scroll-locked')) return
      if (event.touches.length !== 1) return
      if (isTextEntryTarget(event.target)) return
      const touch = event.touches[0]
      if (!touch) return
      startY = touch.clientY
      startX = touch.clientX
      phase = 'pending'
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
      }
      setSettling(false)
    }

    const onMove = (event: TouchEvent) => {
      if (phase === 'idle') return
      if (
        disabledRef.current ||
        refreshingRef.current ||
        document.body.hasAttribute('data-scroll-locked') ||
        event.touches.length !== 1
      ) {
        if (phase === 'pull') snapBack()
        releasePull()
        return
      }
      const touch = event.touches[0]
      if (!touch) return
      const dy = touch.clientY - startY
      const dx = touch.clientX - startX
      if (phase === 'pending') {
        if (window.scrollY > 0) {
          releasePull()
          return
        }
        if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > CLAIM_PX) {
          releasePull()
          return
        }
        if (dy < -CLAIM_PX) {
          releasePull()
          return
        }
        if (dy <= CLAIM_PX) return
        phase = 'pull'
        lockOverscroll()
      }
      if (event.cancelable) event.preventDefault()
      const resisted = Math.min(PULL_MAX_PX, Math.max(0, dy) * RESISTANCE)
      setPull(resisted)
    }

    const onClickCapture = (event: MouseEvent) => {
      if (!suppressClick) return
      suppressClick = false
      if (suppressTimer) {
        clearTimeout(suppressTimer)
        suppressTimer = null
      }
      event.preventDefault()
      event.stopPropagation()
    }

    const onEnd = () => {
      if (phase !== 'pull') {
        releasePull()
        return
      }
      suppressClick = true
      if (suppressTimer) clearTimeout(suppressTimer)
      suppressTimer = setTimeout(() => {
        suppressClick = false
        suppressTimer = null
      }, 500)
      releasePull()
      if (offsetRef.current >= PULL_THRESHOLD_PX) {
        refreshingRef.current = true
        setRefreshing(true)
        setSettling(true)
        setPull(REST_PX)
        triggerHaptic('medium', { intensity: 0.45 })
        const started = Date.now()
        void (async () => {
          try {
            await onRefreshRef.current()
          } catch {
            // Экран сам оставляет уже показанные данные.
          } finally {
            const wait = MIN_VISIBLE_MS - (Date.now() - started)
            if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
            refreshingRef.current = false
            setRefreshing(false)
            setPull(0)
            armSettleEnd()
          }
        })()
        return
      }
      snapBack()
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    window.addEventListener('click', onClickCapture, true)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
      window.removeEventListener('click', onClickCapture, true)
      if (suppressTimer) clearTimeout(suppressTimer)
      unlockOverscroll()
    }
  }, [armSettleEnd, setPull])

  useEffect(() => {
    return () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [])

  const shifted = offset > 0
  const progress = Math.min(1, offset / PULL_THRESHOLD_PX)

  return (
    <div
      className={`${styles.root} ${settling ? styles.settling : ''}`}
      style={shifted || settling ? { transform: `translateY(${offset}px)` } : undefined}
    >
      <div className={styles.indicator} style={{ height: offset }} aria-hidden="true">
        {shifted || refreshing ? (
          <Spinner
            size="3"
            style={{
              opacity: refreshing ? 1 : progress,
              transform: `scale(${0.6 + 0.4 * (refreshing ? 1 : progress)})`,
            }}
          />
        ) : null}
      </div>
      <div className={styles.live} aria-live="polite">
        {refreshing ? 'Обновление' : ''}
      </div>
      {children}
    </div>
  )
}
