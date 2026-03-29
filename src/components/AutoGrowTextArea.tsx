import { useLayoutEffect, useRef } from 'react'
import { TextArea } from '@radix-ui/themes'
import type { ComponentProps } from 'react'
import styles from './AutoGrowTextArea.module.css'

/** Ориентир одной строки для Radix TextArea size="3" (padding + line-box). */
export const AUTO_GROW_TEXTAREA_LINE_HEIGHT_PX = 38

/** Блок «Текст (абзац)» в записи — минимум одна строка по высоте. */
export const AUTO_GROW_TEXTAREA_MIN_ONE_LINE_PX = AUTO_GROW_TEXTAREA_LINE_HEIGHT_PX

/** Поле «Описание» дела — минимум две строки по высоте. */
export const AUTO_GROW_TEXTAREA_MIN_TWO_LINES_PX = AUTO_GROW_TEXTAREA_LINE_HEIGHT_PX * 2

/** Потолок роста; дальше скролл внутри поля. */
export const AUTO_GROW_TEXTAREA_MAX_PX = 350

export type AutoGrowTextAreaProps = Omit<ComponentProps<typeof TextArea>, 'resize' | 'rows'> & {
  minHeightPx?: number
  maxHeightPx?: number
}

/**
 * TextArea с высотой под контент: min/max в px, без ручного resize (конфликтует с авто-высотой).
 */
export function AutoGrowTextArea({
  value,
  onChange,
  minHeightPx = AUTO_GROW_TEXTAREA_MIN_ONE_LINE_PX,
  maxHeightPx = AUTO_GROW_TEXTAREA_MAX_PX,
  size = '3',
  className,
  style,
  ...rest
}: AutoGrowTextAreaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const h = Math.min(Math.max(el.scrollHeight, minHeightPx), maxHeightPx)
    el.style.height = `${h}px`
    el.style.overflowY = el.scrollHeight > maxHeightPx ? 'auto' : 'hidden'
  }, [value, minHeightPx, maxHeightPx])

  return (
    <TextArea
      ref={ref}
      size={size}
      rows={1}
      resize="none"
      className={[styles.root, className].filter(Boolean).join(' ')}
      style={{ maxHeight: maxHeightPx, ...style }}
      value={value}
      onChange={onChange}
      {...rest}
    />
  )
}
