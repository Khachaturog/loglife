import { useCallback } from 'react'
import { IconButton } from '@radix-ui/themes'
import { MinusIcon, PlusIcon } from '@radix-ui/react-icons'
import type { ValueJson } from '@/types/database'
import { useHoldRepeat } from '@/lib/useHoldRepeat'

export type NumberStepperZeroBehavior = 'clearKey' | 'storeZero'

type Props = {
  blockId: string
  /** Для disabled у «минус» при 0 (как на кликере). */
  value: number
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, ValueJson>>>
  /**
   * clearKey — при 0 ключ из state удаляется (FillForm, актуализация на RecordView).
   * storeZero — при 0 в state остаётся `{ number: 0 }` (режим редактирования записи).
   */
  zeroBehavior?: NumberStepperZeroBehavior
}

/**
 * Кнопки ± для блока «Число»: тап или удержание (как ClickerPage).
 * Используется на FillForm и на RecordView (редактирование / актуализация).
 */
export function FillFormNumberStepper({
  blockId,
  value,
  setAnswers,
  zeroBehavior = 'clearKey',
}: Props) {
  const decrement = useCallback(() => {
    setAnswers((prev) => {
      const fromState = (prev[blockId] as { number?: number } | undefined)?.number
      const current = fromState !== undefined ? fromState : value
      const next = Math.max(0, current - 1)
      const out = { ...prev } as Record<string, ValueJson>
      if (next === 0) {
        if (zeroBehavior === 'storeZero') {
          out[blockId] = { number: 0 }
          return out
        }
        delete (out as Record<string, ValueJson> & { [k: string]: ValueJson | undefined })[blockId]
        return out
      }
      out[blockId] = { number: next }
      return out
    })
  }, [blockId, setAnswers, value, zeroBehavior])

  const increment = useCallback(() => {
    setAnswers((prev) => {
      const fromState = (prev[blockId] as { number?: number } | undefined)?.number
      const current = fromState !== undefined ? fromState : value
      return { ...prev, [blockId]: { number: current + 1 } }
    })
  }, [blockId, setAnswers, value])

  const minusHold = useHoldRepeat(decrement)
  const plusHold = useHoldRepeat(increment)

  return (
    <>
      <IconButton
        size="4"
        color="gray"
        variant="classic"
        radius="full"
        type="button"
        aria-label="Уменьшить значение"
        disabled={value === 0}
        onPointerDown={minusHold.handlePointerDown}
        onPointerUp={minusHold.handlePointerUp}
        onPointerLeave={minusHold.handlePointerUp}
        onPointerCancel={minusHold.handlePointerUp}
      >
        <MinusIcon />
      </IconButton>
      <IconButton
        size="4"
        color="gray"
        variant="classic"
        radius="full"
        type="button"
        aria-label="Увеличить значение"
        onPointerDown={plusHold.handlePointerDown}
        onPointerUp={plusHold.handlePointerUp}
        onPointerLeave={plusHold.handlePointerUp}
        onPointerCancel={plusHold.handlePointerUp}
      >
        <PlusIcon />
      </IconButton>
    </>
  )
}
