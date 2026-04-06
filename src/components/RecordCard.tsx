import { Link } from 'react-router-dom'
import { Avatar, Card, Flex, Text } from '@radix-ui/themes'
import type { BlockRow, RecordRow, ValueJson } from '@/types/database'
import { formatAnswerPreviewSegment, formatYesNoOnlyRecordListPreview } from '@/lib/format-utils'
import { persistHistoryListScrollY } from '@/lib/history-scroll-storage'
import styles from './RecordCard.module.css'

type RecordAnswer = { block_id: string; value_json: unknown }

type RecordCardProps = {
  /** Запись с ответами */
  record: RecordRow & { record_answers?: RecordAnswer[] }
  /** Блоки дела для форматирования ответов (по sort_order). Если нет — используется previewAnswer */
  blocks?: BlockRow[]
  /** Префикс «дело» для страницы истории: эмодзи и название */
  deedPrefix?: { emoji: string; name: string }
  /** Эмодзи для аватарки, когда deedPrefix не передан (например на странице дела) */
  avatarFallback?: string
  /** Скрыть аватар (на странице дела эмодзи дела уже в шапке) */
  hideAvatar?: boolean
  /** state для Link (например { from: 'history' }) */
  linkState?: Record<string, string>
}

/**
 * Карточка записи в списке.
 * Вся карточка = ссылка (Card asChild + Link): паддинги и hover от Radix, клик по любой области ведёт на /records/:id.
 * Используется на странице истории и на странице просмотра дела.
 */
export function RecordCard({
  record,
  blocks = [],
  deedPrefix,
  avatarFallback,
  hideAvatar = false,
  linkState,
}: RecordCardProps) {
  const sortedAnswers = [...(record.record_answers ?? [])].sort((a, b) => {
    const blockA = blocks.find((x) => x.id === a.block_id)
    const blockB = blocks.find((x) => x.id === b.block_id)
    const orderA = blockA?.sort_order ?? 0
    const orderB = blockB?.sort_order ?? 0
    return orderA - orderB
  })

  // Дело только из «да/нет» — компактное превью «N из M» вместо «Выполнено · Не выполнено · …».
  const yesNoOnlyPreview = formatYesNoOnlyRecordListPreview(record.record_answers ?? [], blocks)
  const preview =
    yesNoOnlyPreview ??
    (sortedAnswers
      .map((a) => {
        const block = blocks.find((b) => b.id === a.block_id)
        return formatAnswerPreviewSegment(a.value_json as ValueJson, block)
      })
      .filter((s) => s.trim() !== '')
      .join(' · ') || '—')

  const timeStr = record.record_time?.slice(0, 5) ?? ''

  const emoji = deedPrefix?.emoji ?? avatarFallback ?? '📋'
  const title = deedPrefix?.name ?? null

  return (
    <Card asChild>
      <Link
        to={`/records/${record.id}`}
        state={linkState}
        className={styles.recordLink}
        onPointerDownCapture={
          linkState?.from === 'history'
            ? () => {
                // До смены маршрута окно ещё на истории — иначе unmount сохранил бы уже чужой scrollY.
                persistHistoryListScrollY()
              }
            : undefined
        }
      >
        <Flex align="start" gap="2" width="100%">
          {!hideAvatar ? (
            <Avatar
              size="1"
              radius="large"
              color="gray"
              variant="soft"
              fallback={emoji}
            />
          ) : null}
          {/* minWidth: 0 — иначе flex-ребёнок не сужается и truncate не даёт многоточие */}
          <Flex direction="column" gap="1" flexGrow="1" minWidth="0">
            {title ? (
              <Text weight="medium" truncate>
                {title}
              </Text>
            ) : null}
            <Text as="p" size="2">
              {preview}
            </Text>
            </Flex>
              <Text as="p" size="2" color="gray">
                {timeStr}
              </Text>
        </Flex>
      </Link>
    </Card>
  )
}
