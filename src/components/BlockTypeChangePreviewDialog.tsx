/**
 * Модалка превью «Было → Стало» при смене типа блока в редакторе дела.
 */
import { Box, Button, Dialog, Flex, SegmentedControl, Table, Text } from '@radix-ui/themes'
import { formatDate } from '@/lib/format-utils'
import type { BlockTypeChangePreviewRow, DurationNumberUnit } from '@/lib/block-value-type-conversion'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  blockTitle: string
  fromTypeLabel: string
  toTypeLabel: string
  loading: boolean
  error: string | null
  rows: BlockTypeChangePreviewRow[]
  /** Есть ли автоматическая перезапись ответов (число, текст, текст → ссылка). */
  supportsMigrate: boolean
  /** Показать выбор сек / мин / ч для duration → number. */
  showDurationUnit: boolean
  durationUnit: DurationNumberUnit
  onDurationUnitChange: (u: DurationNumberUnit) => void
  onConfirm: () => void
  onCancel: () => void
  confirmBusy: boolean
}

export function BlockTypeChangePreviewDialog({
  open,
  onOpenChange,
  blockTitle,
  fromTypeLabel,
  toTypeLabel,
  loading,
  error,
  rows,
  supportsMigrate,
  showDurationUnit,
  durationUnit,
  onDurationUnitChange,
  onConfirm,
  onCancel,
  confirmBusy,
}: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxHeight="90vh" maxWidth="90vw">
        <Dialog.Title>Смена типа блока</Dialog.Title>
        <Dialog.Description size="2" mb="3">
          Вопрос: {blockTitle || 'Без названия'} · {fromTypeLabel} → {toTypeLabel}
        </Dialog.Description>

        {!supportsMigrate ? (
          <Text size="2" color="gray" mb="2">
            Автоматический перенос ответов для целевого типа пока не выполняется — тип блока в базе обновится, но
            записи могут отображаться как устаревшие до ручной актуализации.
          </Text>
        ) : null}

        {showDurationUnit ? (
          <Flex direction="column" gap="3" mb="3">
            <Flex direction="column" gap="1">
              <Text size="2" weight="medium" as="p">
                Как переводить время в число?
              </Text>
              <Text size="2" color="gray">
                После конвертации не забудьте вручную указать единицу измерения
              </Text>
            </Flex>
            {/* Единица конвертации duration → number: секунды, минуты или часы. */}
            <SegmentedControl.Root
              size="2"
              variant="classic"
              value={durationUnit}
              onValueChange={(v) => onDurationUnitChange(v as DurationNumberUnit)}
              style={{ width: '100%' }}
            >
              <SegmentedControl.Item value="hours">Часы</SegmentedControl.Item>
              <SegmentedControl.Item value="minutes">Минуты</SegmentedControl.Item>
              <SegmentedControl.Item value="seconds">Секунды</SegmentedControl.Item>
            </SegmentedControl.Root>
          </Flex>
        ) : null}

        {error ? (
          <Text size="2" color="red" mb="2" role="alert">
            {error}
          </Text>
        ) : null}

        {loading ? (
          <Text size="2" color="gray">
            Загрузка записей…
          </Text>
        ) : (
          <Flex direction="column" gap="2">
            <Text size="2" color="gray">
              Записей: {rows.length}
            </Text>
            <Box width="100%">
              <Table.Root variant="surface" size="2">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>Запись</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Было</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Стало</Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {rows.map((r) => (
                    <Table.Row key={r.recordId} align="start">
                      <Table.RowHeaderCell>
                        <Text size="2" wrap="nowrap" as="span">
                          {formatDate(r.recordDate)}
                          {r.recordTime ? ` · ${String(r.recordTime).slice(0, 5)}` : ''}
                        </Text>
                      </Table.RowHeaderCell>
                      <Table.Cell>
                        <Text size="2" as="span">
                          {r.beforeDisplay}
                        </Text>
                      </Table.Cell>
                      <Table.Cell>
                        <Text size="2" as="span" color={r.willMigrate ? undefined : 'gray'}>
                          {r.afterDisplay}
                        </Text>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Box>
          </Flex>
        )}

        {/* <Separator size="4" mb="4" /> */}

        <Flex gap="3" justify="end" mt="4">
          <Button
            type="button"
            size="3"
            color="gray"
            variant="surface"
            disabled={loading || confirmBusy}
            loading={confirmBusy}
            onClick={onConfirm}
          >
            Подтвердить
          </Button>
          <Dialog.Close>
            <Button type="button" size="3" variant="classic" disabled={confirmBusy} onClick={onCancel}>
              Отмена
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
