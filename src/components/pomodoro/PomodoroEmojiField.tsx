import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@radix-ui/themes'
import styles from './PomodoroEmojiField.module.css'

const EMOJI_COUNT = 20
const GRAVITY = 1700
const RESTITUTION = 0.42

type Body = {
  x: number
  y: number
  vx: number
  vy: number
  r: number
  size: number
  rot: number
  spin: number
}

type Rect = { left: number; top: number; right: number; bottom: number }

type Gravity = { x: number; y: number }

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function tiltNeedsGesture(): boolean {
  const eventType = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<'granted' | 'denied'>
  }
  return typeof eventType.requestPermission === 'function'
}

function createBodies(width: number, height: number, seedKey: string, settled: boolean): Body[] {
  const rand = mulberry32(hashString(seedKey || 'pomodoro'))
  return Array.from({ length: EMOJI_COUNT }, () => {
    const size = 28 + rand() * 20
    // Радиус почти как половина кегля, иначе глиф залезает на часы.
    const r = size * 0.5
    const span = Math.max(1, width - r * 2)
    return {
      x: r + rand() * span,
      // Без анимации лежат на нижнем крае, а не висят в верхней половине.
      y: settled ? Math.max(r, height - r) : r + rand() * Math.max(1, height * 0.45),
      vx: settled ? 0 : (rand() - 0.5) * 60,
      vy: settled ? 0 : rand() * 30,
      r,
      size,
      rot: (rand() - 0.5) * 30,
      spin: settled ? 0 : (rand() - 0.5) * 25,
    }
  })
}

function paint(node: HTMLSpanElement | null, body: Body) {
  if (!node) return
  node.style.fontSize = `${body.size}px`
  // translate3d, чтобы Safari на iPhone перерисовывал кадр.
  const x = body.x - body.size / 2
  const y = body.y - body.size / 2
  node.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${body.rot}deg)`
}

/** beta 90° — телефон в руке портретом. Слабый вектор не отменяет падение вниз. */
function gravityFromTilt(beta: number | null, gamma: number | null): Gravity | null {
  if (beta == null && gamma == null) return null
  const rad = Math.PI / 180
  const x = Math.sin((gamma ?? 0) * rad)
  const y = Math.sin((beta ?? 0) * rad)
  if (x * x + y * y < 0.04) return { x: 0, y: 1 }
  const len = Math.hypot(x, y)
  return {
    x: Math.max(-1, Math.min(1, x / len)),
    y: Math.max(-1, Math.min(1, y / len)),
  }
}

function readObstacles(field: HTMLElement): Rect[] {
  const origin = field.getBoundingClientRect()
  const nodes = document.querySelectorAll<HTMLElement>('[data-pomodoro-obstacle]')
  const rects: Rect[] = []
  nodes.forEach((node) => {
    const box = node.getBoundingClientRect()
    if (box.width < 1 || box.height < 1) return
    // Небольшой зазор, чтобы глиф не касался текста и кнопок.
    const pad = 10
    rects.push({
      left: box.left - origin.left - pad,
      top: box.top - origin.top - pad,
      right: box.right - origin.left + pad,
      bottom: box.bottom - origin.top + pad,
    })
  })
  return rects
}

function bounceOffRect(body: Body, rect: Rect) {
  const closestX = Math.max(rect.left, Math.min(body.x, rect.right))
  const closestY = Math.max(rect.top, Math.min(body.y, rect.bottom))
  let dx = body.x - closestX
  let dy = body.y - closestY
  let distSq = dx * dx + dy * dy
  if (distSq >= body.r * body.r && distSq > 0) return

  if (distSq === 0) {
    const left = body.x - rect.left
    const right = rect.right - body.x
    const top = body.y - rect.top
    const bottom = rect.bottom - body.y
    const min = Math.min(left, right, top, bottom)
    if (min === left) dx = -1
    else if (min === right) dx = 1
    else dx = 0
    if (min === top) dy = -1
    else if (min === bottom) dy = 1
    else if (min !== left && min !== right) dy = 0
    distSq = 1
  }

  const dist = Math.sqrt(distSq) || 1
  const nx = dx / dist
  const ny = dy / dist
  const overlap = body.r - dist
  if (overlap > 0) {
    body.x += nx * overlap
    body.y += ny * overlap
  }
  const speed = body.vx * nx + body.vy * ny
  if (speed < 0) {
    body.vx -= (1 + RESTITUTION) * speed * nx
    body.vy -= (1 + RESTITUTION) * speed * ny
  }
}

function bounceOffPeer(a: Body, b: Body) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const distSq = dx * dx + dy * dy
  const min = a.r + b.r
  if (distSq >= min * min || distSq === 0) return
  const dist = Math.sqrt(distSq)
  const nx = dx / dist
  const ny = dy / dist
  const overlap = min - dist
  a.x -= nx * overlap * 0.5
  a.y -= ny * overlap * 0.5
  b.x += nx * overlap * 0.5
  b.y += ny * overlap * 0.5
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny
  if (rel > 0) return
  const impulse = rel * (1 + RESTITUTION) * 0.5
  a.vx += impulse * nx
  a.vy += impulse * ny
  b.vx -= impulse * nx
  b.vy -= impulse * ny
}

function step(bodies: Body[], dt: number, width: number, height: number, gravity: Gravity, obstacles: Rect[]) {
  const damp = Math.exp(-0.6 * dt)
  for (const body of bodies) {
    body.vx = (body.vx + gravity.x * GRAVITY * dt) * damp
    body.vy = (body.vy + gravity.y * GRAVITY * dt) * damp
    body.x += body.vx * dt
    body.y += body.vy * dt
    body.rot += body.spin * dt
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) bounceOffPeer(bodies[i], bodies[j])
  }
  for (const body of bodies) {
    for (const rect of obstacles) bounceOffRect(body, rect)
    if (body.x - body.r < 0) {
      body.x = body.r
      body.vx = Math.abs(body.vx) * RESTITUTION
    } else if (body.x + body.r > width) {
      body.x = width - body.r
      body.vx = -Math.abs(body.vx) * RESTITUTION
    }
    if (body.y - body.r < 0) {
      body.y = body.r
      body.vy = Math.abs(body.vy) * RESTITUTION
    } else if (body.y + body.r > height) {
      body.y = height - body.r
      body.vy = -Math.abs(body.vy) * RESTITUTION
      body.vx *= 0.86
    }
  }
}

type PomodoroEmojiFieldProps = {
  emoji: string
}

/**
 * Около 20 копий эмодзи проекта. Наклон задаёт гравитацию,
 * эмодзи отскакивают от краёв и от помеченных элементов экрана.
 * Без датчика и при слабом наклоне падают вниз. При reduced motion лежат внизу.
 */
export function PomodoroEmojiField({ emoji }: PomodoroEmojiFieldProps) {
  const fieldRef = useRef<HTMLDivElement>(null)
  const bitRefs = useRef<Array<HTMLSpanElement | null>>([])
  const gravityRef = useRef<Gravity>({ x: 0, y: 1 })
  const orientationHandlerRef = useRef<((event: DeviceOrientationEvent) => void) | null>(null)
  const [needsButton, setNeedsButton] = useState(false)

  function attachOrientation() {
    if (orientationHandlerRef.current) return
    const handler = (event: DeviceOrientationEvent) => {
      const next = gravityFromTilt(event.beta, event.gamma)
      if (next) gravityRef.current = next
    }
    orientationHandlerRef.current = handler
    window.addEventListener('deviceorientation', handler)
  }

  useEffect(() => {
    if (prefersReducedMotion() || typeof DeviceOrientationEvent === 'undefined') return
    if (tiltNeedsGesture()) {
      setNeedsButton(true)
      return
    }
    attachOrientation()
  }, [])

  useEffect(() => {
    return () => {
      if (!orientationHandlerRef.current) return
      window.removeEventListener('deviceorientation', orientationHandlerRef.current)
      orientationHandlerRef.current = null
    }
  }, [])

  useLayoutEffect(() => {
    const field = fieldRef.current
    if (!field) return
    const reduced = prefersReducedMotion()
    let frame = 0

    const spawn = () => {
      const width = field.clientWidth || 320
      const height = field.clientHeight || 640
      const bodies = createBodies(width, height, emoji, reduced)
      bodies.forEach((body, index) => paint(bitRefs.current[index], body))
      return bodies
    }

    const bodies = spawn()
    if (reduced) return

    let last = performance.now()
    const loop = (now: number) => {
      try {
        const dt = Math.min(0.032, (now - last) / 1000)
        last = now
        const width = field.clientWidth
        const height = field.clientHeight
        if (width > 0 && height > 0) {
          step(bodies, dt, width, height, gravityRef.current, readObstacles(field))
          bodies.forEach((body, index) => paint(bitRefs.current[index], body))
        }
      } catch (err) {
        // Один сбойный кадр не должен останавливать всю симуляцию.
        field.dataset.physicsError = err instanceof Error ? err.message : 'physics'
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [emoji])

  async function enableTilt() {
    const eventType = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>
    }
    try {
      const result = await eventType.requestPermission?.()
      if (result && result !== 'granted') {
        setNeedsButton(false)
        return
      }
      // Слушатель в том же жесте, что и разрешение: iOS иначе не шлёт углы.
      attachOrientation()
      setNeedsButton(false)
    } catch {
      setNeedsButton(false)
    }
  }

  return (
    <div ref={fieldRef} className={styles.wrap} aria-hidden>
      {Array.from({ length: EMOJI_COUNT }, (_, index) => (
        <span
          key={index}
          ref={(node) => { bitRefs.current[index] = node }}
          className={styles.bit}
        >
          {emoji}
        </span>
      ))}
      {needsButton && createPortal(
        <Button
          type="button"
          size="3"
          variant="surface"
          color="gray"
          className={styles.tiltButton}
          onClick={() => void enableTilt()}
        >
          Разрешить наклон
        </Button>,
        document.body,
      )}
    </div>
  )
}
