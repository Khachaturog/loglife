import type { ComponentProps } from 'react'
import { Flex, SegmentedControl, Text } from '@radix-ui/themes'
import type { BlockConfig } from '@/types/database'
import { clampScaleDivisions, getScaleDivisionCaption, scaleHasAnyLabels } from '@/lib/scale-block'
import scaleSegmentedStyles from '@/components/ScaleSegmentedControl.module.css'

export type ScaleAnswerFieldProps = {
  config: BlockConfig | null
  /** Текущее значение шкалы (1…divisions) или пусто до выбора */
  value: number | undefined
  onScaleValueChange: (n: number) => void
  /** Размер сегментов — как на FillForm / RecordView */
  size: ComponentProps<typeof SegmentedControl.Root>['size']
}

/**
 * Сегментированная шкала и при необходимости подпись выбранного деления под ней
 * (только если в конфиге задана хотя бы одна подпись).
 */
export function ScaleAnswerField({ config, value, onScaleValueChange, size }: ScaleAnswerFieldProps) {
  const divisions = clampScaleDivisions(config)
  // Подпись под шкалой — только если есть смысл (хотя бы одна непустая метка в конфиге).
  const showCaption = scaleHasAnyLabels(config, divisions)
  const caption = showCaption ? getScaleDivisionCaption(config, divisions, value) : null

  return (
    <Flex direction="column" gap="2">
      <SegmentedControl.Root
        className={scaleSegmentedStyles.root}
        value={value?.toString()}
        onValueChange={(v) => onScaleValueChange(Number(v))}
        size={size}
      >
        {Array.from({ length: divisions }, (_, i) => i + 1).map((n) => (
          <SegmentedControl.Item key={n} value={String(n)}>
            {n}
          </SegmentedControl.Item>
        ))}
      </SegmentedControl.Root>
      {caption != null && (
        <Text as="p" size="3" color="gray">
          {caption}
        </Text>
      )}
    </Flex>
  )
}
