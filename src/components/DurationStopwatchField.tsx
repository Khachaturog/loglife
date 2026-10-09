import { useEffect, useState } from 'react'
import { Box, Button, Dialog, Flex, Heading, IconButton } from '@radix-ui/themes'
import { Timer } from 'lucide-react'
import { DurationInput } from '@/components/DurationInput'
import { triggerHaptic } from '@/lib/haptics'

/** Потолок маски поля: 99:59:59. */
const MAX_ELAPSED_MS = (99 * 3600 + 59 * 60 + 59) * 1000

type Props = {
  value: string
  onChange: (hms: string) => void
  /** Название вопроса — под заголовком модалки, чтобы было ясно, куда пишется время. */
  questionTitle?: string
  placeholder?: string
  disabled?: boolean
  id?: string
}

/**
 * Время из поля в миллисекунды.
 * Неполная строка читается так же, как маска при уходе с поля: «5» — 5 часов, «1:2» — 1 час 2 минуты.
 */
function hmsToMs(raw: string): number {
  const parts = raw.trim().split(':')
  if (!raw.trim()) return 0
  const numbers = parts.map((part) => {
    const parsed = parseInt(part.replace(/\D/g, ''), 10)
    return Number.isFinite(parsed) ? parsed : 0
  })
  const hours = Math.min(99, Math.max(0, numbers[0] ?? 0))
  const minutes = Math.min(59, Math.max(0, numbers[1] ?? 0))
  const seconds = Math.min(59, Math.max(0, numbers[2] ?? 0))
  return Math.min(MAX_ELAPSED_MS, (hours * 3600 + minutes * 60 + seconds) * 1000)
}

/** ЧЧ:ММ:СС из миллисекунд, с обрезкой по потолку маски. */
function formatStopwatchHms(ms: number): string {
  const capped = Math.min(MAX_ELAPSED_MS, Math.max(0, ms))
  const totalSeconds = Math.floor(capped / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':')
}

/**
 * Поле длительности и кнопка секундомера.
 * Диалог открывается остановленным с времени из поля; «Сброс» обнуляет замер.
 * В ответ пишется только «Сохранить».
 */
export function DurationStopwatchField({
  value,
  onChange,
  questionTitle,
  placeholder = '00:00:00',
  disabled,
  id,
}: Props) {
  const [open, setOpen] = useState(false)
  const [running, setRunning] = useState(false)
  /** Накопленное время на паузах, без текущего отрезка. */
  const [accumulatedMs, setAccumulatedMs] = useState(0)
  /** Момент старта текущего отрезка; null, пока секундомер стоит. */
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const title = questionTitle?.trim() ?? ''

  // Тик только пока диалог открыт и идёт отсчёт. База — Date.now(), поэтому фон вкладки не сдвигает время.
  useEffect(() => {
    if (!open || !running) return
    const timer = window.setInterval(() => setNow(Date.now()), 200)
    return () => window.clearInterval(timer)
  }, [open, running])

  const elapsedMs = Math.min(
    MAX_ELAPSED_MS,
    accumulatedMs + (running && startedAt != null ? Math.max(0, now - startedAt) : 0),
  )

  function resetRun() {
    setRunning(false)
    setAccumulatedMs(0)
    setStartedAt(null)
    setNow(Date.now())
  }

  /** Останавливает отсчёт и оставляет на экране уже посчитанное время (без вспышки нуля). */
  function freeze(): number {
    const extra = running && startedAt != null ? Math.max(0, Date.now() - startedAt) : 0
    const ms = Math.min(MAX_ELAPSED_MS, accumulatedMs + extra)
    setAccumulatedMs(ms)
    setRunning(false)
    setStartedAt(null)
    return ms
  }

  function handleOpenChange(next: boolean) {
    // Останавливаем отсчёт, не обнуляя цифры: иначе вспышка нуля на анимации закрытия.
    if (!next) freeze()
    setOpen(next)
  }

  function openStopwatch() {
    triggerHaptic('medium', { intensity: 1 })
    // Продолжение с уже введённого времени. С нуля — отдельная кнопка «Сброс».
    setRunning(false)
    setStartedAt(null)
    setAccumulatedMs(hmsToMs(value))
    setNow(Date.now())
    setOpen(true)
  }

  function toggleRun() {
    triggerHaptic('medium', { intensity: 1 })
    if (running) {
      const extra = startedAt != null ? Math.max(0, Date.now() - startedAt) : 0
      setAccumulatedMs((prev) => Math.min(MAX_ELAPSED_MS, prev + extra))
      setStartedAt(null)
      setRunning(false)
      return
    }
    const started = Date.now()
    setStartedAt(started)
    setNow(started)
    setRunning(true)
  }

  function reset() {
    triggerHaptic('medium', { intensity: 1 })
    resetRun()
  }

  function save() {
    triggerHaptic('medium', { intensity: 1 })
    onChange(formatStopwatchHms(freeze()))
    setOpen(false)
  }

  return (
    <>
      <Flex gap="2" align="center">
        <Box flexGrow="1" minWidth="0">
          <DurationInput
            id={id}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
          />
        </Box>
        <IconButton
          type="button"
          size="3"
          variant="surface"
          color="gray"
          aria-label="Секундомер"
          disabled={disabled}
          onClick={openStopwatch}
        >
          <Timer size={16} />
        </IconButton>
      </Flex>

      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        {/* Клик по затемнению не закрывает: иначе случайное нажатие сбрасывает идущий отсчёт. */}
        <Dialog.Content
          maxWidth="420px"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <Dialog.Title>Секундомер</Dialog.Title>
          {title ? (
            <Dialog.Description size="2" mb="3">
              {title}
            </Dialog.Description>
          ) : null}

          <Flex direction="column" align="center" gap="4">
            <Heading
              as="h2"
              size={{ initial: '8', sm: '9' }}
              align="center"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatStopwatchHms(elapsedMs)}
            </Heading>
            <Flex gap="2" wrap="wrap" justify="center">
              <Button type="button" size="3" color="gray" variant="surface" onClick={toggleRun}>
                {running ? 'Пауза' : 'Старт'}
              </Button>
              <Button type="button" size="3" color="gray" variant="surface" onClick={reset}>
                Сброс
              </Button>
            </Flex>
            <Flex gap="2" justify="end" width="100%">
              <Dialog.Close>
                <Button type="button" size="3" color="gray" variant="surface">
                  Закрыть
                </Button>
              </Dialog.Close>
              <Button type="button" size="3" variant="solid" onClick={save}>
                Сохранить
              </Button>
            </Flex>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </>
  )
}
