import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Box, Button, Flex, Text } from '@radix-ui/themes'
import { ChevronRight } from 'lucide-react'
import { AppBar } from '@/components/AppBar'
import { PageLoading } from '@/components/PageLoading'
import { PomodoroProjectsSheet } from '@/components/pomodoro/PomodoroProjectsSheet'
import { OnboardingHelpButton } from '@/components/onboarding/OnboardingHelpButton'
import { api } from '@/lib/api'
import { triggerHaptic } from '@/lib/haptics'
import {
  formatFocusClock,
  formatFocusSum,
  POMODORO_DEFAULT_FOCUS_SECONDS,
  POMODORO_FALLBACK_EMOJI,
  POMODORO_FREE_LABEL,
  readActiveSession,
  readSelectedProjectId,
  textOnAccent,
  writeActiveSession,
  writeSelectedProjectId,
  type PomodoroActiveSession,
} from '@/lib/pomodoro'
import type { PomodoroProjectRow, PomodoroSessionStatus, PomodoroSettingsRow } from '@/types/database'
import layoutStyles from '@/styles/layout.module.css'
import styles from './PomodoroPage.module.css'

const HOLD_MS = 1000
const SLOT_GLYPHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function sameSlotDigits(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((digit, index) => digit === b[index])
}

/** Лента 0–9 на одну группу цифр. Тот же приём, что у числа на карточке дела. */
function SlotRun({ value }: { value: string }) {
  const [digits, setDigits] = useState<number[]>(() => value.split('').map((ch) => Number(ch)))
  const digitsRef = useRef(digits)
  digitsRef.current = digits

  useEffect(() => {
    const target = value.split('').map((ch) => Number(ch))
    if (prefersReducedMotion()) {
      setDigits(target)
      return
    }
    if (sameSlotDigits(digitsRef.current, target)) return

    const frames: number[] = []
    const schedule = (fn: () => void) => {
      frames.push(requestAnimationFrame(fn))
    }
    const prev = digitsRef.current
    // Новый разряд сначала ноль, иначе он сразу окажется на итоговой цифре.
    if (target.length > prev.length) {
      const padded = Array.from({ length: target.length }, () => 0)
      for (let i = 0; i < prev.length; i++) {
        padded[padded.length - 1 - i] = prev[prev.length - 1 - i]
      }
      setDigits(padded)
      schedule(() => {
        schedule(() => setDigits(target))
      })
    } else {
      schedule(() => setDigits(target))
    }
    return () => {
      for (const id of frames) cancelAnimationFrame(id)
    }
  }, [value])

  return (
    <span className={styles.slot} aria-hidden>
      {digits.map((digit, index) => {
        const place = digits.length - 1 - index
        return (
          <span key={place} className={styles.slotDigit}>
            <span
              className={styles.slotStrip}
              style={{ transform: `translateY(calc(${digit} * var(--slot-step) * -1))` }}
            >
              {SLOT_GLYPHS.map((glyph) => (
                <span key={glyph} className={styles.slotCell}>{glyph}</span>
              ))}
            </span>
          </span>
        )
      })}
    </span>
  )
}

/** Схлопывает блок по высоте. Соседний flex-центр из-за этого плавно переезжает, а не прыгает. */
function CollapseSlot({
  open,
  className,
  children,
}: {
  open: boolean
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const seen = useRef(false)

  useLayoutEffect(() => {
    const node = ref.current
    const inner = node?.firstElementChild as HTMLElement | null
    if (!node || !inner) return
    if (open) node.removeAttribute('inert')
    else node.setAttribute('inert', '')

    const lock = (height: string) => {
      node.style.maxHeight = height
    }
    // Первый кадр без анимации: сеанс после обновления страницы уже в центре.
    if (!seen.current) {
      seen.current = true
      lock(open ? `${inner.scrollHeight}px` : '0px')
      return
    }
    if (!open) {
      lock(`${inner.scrollHeight}px`)
      void node.offsetHeight
    }
    lock(open ? `${inner.scrollHeight}px` : '0px')
  }, [open])

  return (
    <div
      ref={ref}
      className={[styles.collapseSlot, open ? '' : styles.collapseSlotClosed, className].filter(Boolean).join(' ')}
      aria-hidden={open ? undefined : true}
    >
      <div className={styles.collapseInner}>{children}</div>
    </div>
  )
}

/** Часы простоя: цифры крутятся при смене проекта, двоеточие стоит. */
function PomodoroSlotClock({ seconds }: { seconds: number }) {
  const safe = Math.max(0, Math.round(seconds))
  const minutes = String(Math.floor(safe / 60))
  const secs = (safe % 60).toString().padStart(2, '0')
  return (
    <span className={styles.clock} aria-label={formatFocusClock(seconds)}>
      <SlotRun value={minutes} />
      <span>:</span>
      <SlotRun value={secs} />
    </span>
  )
}

function pomodoroErrorText(err: unknown): string {
  const raw = err instanceof Error
    ? err.message
    : err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
      ? err.message
      : ''
  if (/schema cache|pomodoro_/i.test(raw)) {
    return 'Таблицы помодоро ещё не созданы. Нужна миграция 20261009120000_pomodoro_widget.'
  }
  return raw || 'Не удалось загрузить помодоро'
}

/**
 * Виджет помодоро: один экран таймера, проекты поверх него.
 * Незавершённый сеанс лежит в localStorage, дефолты минут — в базе.
 */
export function PomodoroPage() {
  const [loading, setLoading] = useState(true)
  const [projects, setProjects] = useState<PomodoroProjectRow[]>([])
  const [settings, setSettings] = useState<PomodoroSettingsRow | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [active, setActive] = useState<PomodoroActiveSession | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [sheetOpen, setSheetOpen] = useState(false)
  const [totals, setTotals] = useState({ todaySeconds: 0, totalSeconds: 0 })
  const [error, setError] = useState<string | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const finishingRef = useRef(false)
  const holdFrameRef = useRef<number | null>(null)
  const holdStartRef = useRef<number | null>(null)

  const selected = projects.find((project) => project.id === selectedId) ?? null
  const runningProject = active ? projects.find((project) => project.id === active.projectId) ?? null : null
  const displayProject = active ? runningProject : selected
  const emoji = displayProject?.emoji ?? POMODORO_FALLBACK_EMOJI
  const name = displayProject?.name ?? POMODORO_FREE_LABEL
  const accent = displayProject?.accent_color ?? null
  const idleSeconds = selected?.focus_seconds ?? settings?.focus_seconds ?? POMODORO_DEFAULT_FOCUS_SECONDS

  const elapsed = active ? Math.max(0, (now - active.startedAtMs) / 1000) : 0
  const remaining = active ? Math.max(0, active.plannedSeconds - elapsed) : idleSeconds
  const progress = active ? Math.min(1, elapsed / active.plannedSeconds) : 0

  const reload = useCallback(async () => {
    const [settingsRow, projectRows] = await Promise.all([
      api.pomodoro.getSettings(),
      api.pomodoro.listProjects(),
    ])
    setSettings(settingsRow)
    setProjects(projectRows)
    return projectRows
  }, [])

  useEffect(() => {
    let cancelled = false
    reload()
      .then((projectRows) => {
        if (cancelled) return
        const storedActive = readActiveSession()
        const storedSelected = readSelectedProjectId()
        const selectedStillExists = storedSelected != null && projectRows.some((project) => project.id === storedSelected)
        setSelectedId(selectedStillExists ? storedSelected : null)
        if (!selectedStillExists) writeSelectedProjectId(null)
        setActive(storedActive)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(pomodoroErrorText(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [reload])

  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [active])

  // Документ не скроллится, а края экрана и панели браузера красятся в цвет проекта.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prev = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      htmlOverscroll: html.style.overscrollBehavior,
      bodyOverscroll: body.style.overscrollBehavior,
      htmlBg: html.style.backgroundColor,
      bodyBg: body.style.backgroundColor,
    }
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    html.style.overscrollBehavior = 'none'
    body.style.overscrollBehavior = 'none'
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const createdMeta = !meta
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    const prevTheme = meta.content
    if (accent) {
      html.style.backgroundColor = accent
      body.style.backgroundColor = accent
      meta.content = accent
    }
    return () => {
      html.style.overflow = prev.htmlOverflow
      body.style.overflow = prev.bodyOverflow
      html.style.overscrollBehavior = prev.htmlOverscroll
      body.style.overscrollBehavior = prev.bodyOverscroll
      html.style.backgroundColor = prev.htmlBg
      body.style.backgroundColor = prev.bodyBg
      if (createdMeta) meta.remove()
      else meta.content = prevTheme
    }
  }, [accent])

  const finish = useCallback(async (status: PomodoroSessionStatus) => {
    const session = readActiveSession()
    if (!session || finishingRef.current) return
    finishingRef.current = true
    const endedMs = Date.now()
    const elapsedSeconds = Math.max(0, Math.round((endedMs - session.startedAtMs) / 1000))
    const actualSeconds = status === 'completed'
      ? session.plannedSeconds
      : Math.min(session.plannedSeconds, elapsedSeconds)
    writeActiveSession(null)
    setActive(null)
    try {
      await api.pomodoro.createSession({
        projectId: session.projectId,
        plannedSeconds: session.plannedSeconds,
        actualSeconds,
        status,
        startedAt: new Date(session.startedAtMs).toISOString(),
        endedAt: new Date(endedMs).toISOString(),
      })
      const nextTotals = await api.pomodoro.focusTotals(session.projectId)
      setTotals(nextTotals)
    } catch (err) {
      setError(pomodoroErrorText(err))
    } finally {
      finishingRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!active) return
    if (now - active.startedAtMs >= active.plannedSeconds * 1000) {
      void finish('completed')
    }
  }, [active, now, finish])

  useEffect(() => {
    if (loading) return
    const projectId = active?.projectId ?? selectedId
    let cancelled = false
    api.pomodoro
      .focusTotals(projectId)
      .then((next) => {
        if (!cancelled) setTotals(next)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [loading, selectedId, active?.projectId])

  function selectProject(projectId: string | null) {
    setSelectedId(projectId)
    writeSelectedProjectId(projectId)
  }

  function clearHold() {
    if (holdFrameRef.current != null) cancelAnimationFrame(holdFrameRef.current)
    holdFrameRef.current = null
    holdStartRef.current = null
    setHoldProgress(0)
  }

  function holdTick(time: number) {
    if (holdStartRef.current == null) return
    const next = Math.min(1, (time - holdStartRef.current) / HOLD_MS)
    setHoldProgress(next)
    if (next >= 1) {
      clearHold()
      triggerHaptic('heavy')
      void finish('stopped')
      return
    }
    holdFrameRef.current = requestAnimationFrame(holdTick)
  }

  function onPagePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!active || finishingRef.current || event.button !== 0) return
    // Захват нужен, чтобы отпускание засчиталось и вне страницы. Без активного pointerId он бросает.
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Удержание всё равно идёт, пока жест не отменён.
    }
    holdStartRef.current = performance.now()
    holdFrameRef.current = requestAnimationFrame(holdTick)
    triggerHaptic('medium')
  }

  function startFocus() {
    if (active || !settings) return
    const plannedSeconds = selected?.focus_seconds ?? settings.focus_seconds
    const session: PomodoroActiveSession = {
      projectId: selected?.id ?? null,
      plannedSeconds,
      startedAtMs: Date.now(),
    }
    writeActiveSession(session)
    setActive(session)
    setNow(Date.now())
    triggerHaptic('medium')
  }

  if (loading) {
    return <PageLoading title="Помодоро" backHref="/widgets" />
  }

  const startInk = accent ? textOnAccent(accent) : undefined

  return (
    <Flex
      direction="column"
      className={`${layoutStyles.pageContainer} ${styles.pageRoot}`}
      style={accent ? { backgroundColor: accent, color: startInk } : undefined}
      onPointerDown={onPagePointerDown}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onContextMenu={(event) => { if (active) event.preventDefault() }}
    >
      {/* Во время сеанса шапка схлопывается, а не пропадает: часы доезжают в центр. */}
      <CollapseSlot open={active == null} className={styles.barObstacle}>
        <AppBar
          backHref="/widgets"
          title="Помодоро"
          actions={<OnboardingHelpButton flowId="help_pomodoro" />}
        />
      </CollapseSlot>

      <Box className={styles.stage}>
        <Flex direction="column" align="center" justify="center" gap="3" className={styles.clockBlock}>
          <span>
            {active ? (
              <Text className={styles.clock} as="p" style={startInk ? { color: startInk } : undefined}>
                {formatFocusClock(Math.ceil(remaining))}
              </Text>
            ) : (
              <PomodoroSlotClock seconds={idleSeconds} />
            )}
          </span>
          <Flex direction="column" align="center">
            <Button
              type="button"
              size="4"
              color="gray"
              variant="ghost"
              radius="full"
              disabled={active != null}
              onClick={() => setSheetOpen(true)}
            >
              <span aria-hidden>{emoji}</span>
              {name}
              {!active && <ChevronRight size={16} />}
            </Button>
            <CollapseSlot open={active != null} className={styles.followSlot}>
              <span className={styles.sessionTrack} aria-hidden>
                <span className={styles.sessionFill} style={{ width: `${progress * 100}%` }} />
              </span>
            </CollapseSlot>
            <CollapseSlot open={active == null} className={styles.followSlot}>
              <Text size="2" color="gray" align="center">
                сегодня {formatFocusSum(totals.todaySeconds)} · всего {formatFocusSum(totals.totalSeconds)}
              </Text>
            </CollapseSlot>
          </Flex>
          {error && <Text size="2" color="red" align="center">{error}</Text>}
        </Flex>

        <CollapseSlot open={active == null} className={styles.bottomAction}>
          <Button
            type="button"
            size="4"
            radius="full"
            variant="classic"
            highContrast={true}
            disabled={!settings || active != null}
            onClick={startFocus}
          >
            Начать
          </Button>
        </CollapseSlot>

        {active && (
          <Flex direction="column" align="center" gap="2" className={styles.holdHint}>
            {holdProgress > 0 && (
              <span className={styles.holdTrack} aria-hidden>
                <span className={styles.holdFill} style={{ width: `${holdProgress * 100}%` }} />
              </span>
            )}
            <Text size="2" color="gray"> Зажмите, чтобы выйти</Text>
          </Flex>
        )}
      </Box>

      <PomodoroProjectsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        projects={projects}
        settingsFocusSeconds={settings?.focus_seconds ?? POMODORO_DEFAULT_FOCUS_SECONDS}
        selectedProjectId={selectedId}
        onSelect={selectProject}
        onChanged={async () => { await reload() }}
      />
    </Flex>
  )
}
