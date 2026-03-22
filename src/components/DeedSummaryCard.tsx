import { useId } from 'react'
import { Avatar, Card, Flex, Text } from '@radix-ui/themes'
import type { DeedRow } from '@/types/database'

export type DeedSummaryCardProps = {
  /** Минимум полей для отображения (совместимо с DeedWithBlocks). */
  deed: Pick<DeedRow, 'emoji' | 'name' | 'description'>
}

/**
 * Визуальный блок «с каким делом работаем»: эмодзи, название, описание.
 * Используется в формах записи, чтобы контекст не терялся среди полей.
 */
export function DeedSummaryCard({ deed }: DeedSummaryCardProps) {
  const titleId = useId()

  return (
    <Card size='1' role="group" aria-labelledby={titleId}>
      <Flex direction="row" align="baseline" gap="3">
        <Avatar
          size="1"
          radius="large"
          color="gray"
          variant="soft"
          fallback={deed.emoji?.trim() || '📋'}
          aria-hidden
        />
        <Flex direction="column" align="start" gap="1">
          <Text weight="medium" id={titleId} truncate>{deed.name}</Text>
          <Text as="p" size="2" color="gray" truncate>{deed.description?.trim()}</Text>
        </Flex>
      </Flex>
    </Card>
  )
}
