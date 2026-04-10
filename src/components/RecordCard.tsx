import { Link, useNavigate } from 'react-router-dom'
import { AlertDialog, Button, Card, ContextMenu, Flex, Text } from '@radix-ui/themes'
import type { BlockRow, RecordRow, RecordWithAnswers, ValueJson } from '@/types/database'
import { answersFromRecord } from '@/lib/answers-from-record'
import { api } from '@/lib/api'
import { formatAnswerPreviewSegment, formatYesNoOnlyRecordListPreview } from '@/lib/format-utils'
import { triggerHaptic } from '@/lib/haptics'
import { persistHistoryListScrollY } from '@/lib/history-scroll-storage'
import { useRef, useState } from 'react'
import styles from './RecordCard.module.css'
import { BackpackIcon, CopyIcon, Pencil1Icon, PlusIcon, TrashIcon } from '@radix-ui/react-icons'

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
  /** state для Link / navigate (напр. { from: 'history' }) */
  linkState?: Record<string, unknown>
  /** Серый текст превью — только на странице «История»; на странице дела оставляем обычный цвет */
  previewGray?: boolean
  /** После удаления записи на сервере — обновить список на родителе (История / дело) */
  onRecordDeleted?: () => void | Promise<void>
}

/**
 * Карточка записи в списке.
 * Вся карточка = ссылка: короткий тап / ЛКМ — просмотр записи; long tap / ПКМ — меню (к делу, новая запись, дублировать, редактировать, удалить).
 */
export function RecordCard({
  record,
  blocks = [],
  deedPrefix,
  avatarFallback,
  hideAvatar = false,
  linkState,
  previewGray = false,
  onRecordDeleted,
}: RecordCardProps) {
  const navigate = useNavigate()
  const deleteConfirmButtonRef = useRef<HTMLButtonElement>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const sortedAnswers = [...(record.record_answers ?? [])].sort((a, b) => {
    const blockA = blocks.find((x) => x.id === a.block_id)
    const blockB = blocks.find((x) => x.id === b.block_id)
    const orderA = blockA?.sort_order ?? 0
    const orderB = blockB?.sort_order ?? 0
    return orderA - orderB
  })

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

  const historyScrollCapture =
    linkState?.from === 'history'
      ? () => {
          persistHistoryListScrollY()
        }
      : undefined

  /** Страница дела; с истории — сохраняем скролл списка, как при тапе по карточке. */
  function handleGoToDeed() {
    if (linkState?.from === 'history') persistHistoryListScrollY()
    navigate(`/deeds/${record.deed_id}`)
  }

  /** Пустая форма новой записи по тому же делу (как кнопка на странице записи). */
  function handleNewRecord() {
    navigate(`/deeds/${record.deed_id}/fill`)
  }

  function handleDuplicate() {
    navigate(`/deeds/${record.deed_id}/fill`, {
      state: { fillDuplicateAnswers: answersFromRecord(record as RecordWithAnswers) },
    })
  }

  function handleEdit() {
    navigate(`/records/${record.id}`, {
      state: { ...linkState, openEditing: true },
    })
  }

  async function confirmDelete() {
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      await api.records.delete(record.id)
      setDeleteOpen(false)
      await onRecordDeleted?.()
      if (!onRecordDeleted) {
        if (linkState?.from === 'history') navigate('/history')
        else navigate(`/deeds/${record.deed_id}`)
      }
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Не удалось удалить запись')
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <>
      <ContextMenu.Root
        onOpenChange={(open) => {
          if (open) triggerHaptic('medium', { intensity: 0.45 })
        }}
      >
        {/* Themes: Trigger без asChild — обёртка на всю ширину, иначе long press / ПКМ не на всей карточке */}
        <ContextMenu.Trigger>
          <span className={styles.contextTrigger}>
            <Card asChild>
              <Link
                to={`/records/${record.id}`}
                state={linkState}
                className={styles.recordLink}
                onPointerDownCapture={historyScrollCapture}
              >
                <Flex align="baseline" gap="2" width="100%">
                  {!hideAvatar ? <Text size="2">{emoji}</Text> : null}
                  <Flex direction="column" gap="1" flexGrow="1" minWidth="0">
                    {title ? (
                      <Text size="3" weight="medium" truncate>
                        {title}
                      </Text>
                    ) : null}
                    <Text as="p" size="3" color={previewGray ? 'gray' : undefined}>
                      {preview}
                    </Text>
                  </Flex>
                  <Text as="p" size="2" color="gray">
                    {timeStr}
                  </Text>
                </Flex>
              </Link>
            </Card>
          </span>
        </ContextMenu.Trigger>

        <ContextMenu.Content size="2" variant="solid">
          <ContextMenu.Item
            onSelect={() => {
              handleGoToDeed()
            }}
          >
            <BackpackIcon />
            Перейти к делу
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            onSelect={() => {
              handleNewRecord()
            }}
          >
            <PlusIcon />
            Новая запись
          </ContextMenu.Item>
          <ContextMenu.Item
            onSelect={() => {
              handleDuplicate()
            }}
          >
            <CopyIcon />
            Дублировать
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            onSelect={() => {
              handleEdit()
            }}
          >
            <Pencil1Icon />
            Редактировать
          </ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item
            color="red"
            onSelect={() => {
              setDeleteError(null)
              setDeleteOpen(true)
            }}
          >
            <TrashIcon />
            Удалить
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>

      <AlertDialog.Root open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialog.Content
          maxWidth="450px"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            // Radix по умолчанию фокусирует «Отмену»; переносим на «Удалить», чтобы Enter подтверждал.
            deleteConfirmButtonRef.current?.focus({ preventScroll: true })
          }}
        >
          <AlertDialog.Title>Удалить запись?</AlertDialog.Title>
          <AlertDialog.Description size="2">Запись будет удалена без возможности восстановления</AlertDialog.Description>
          {deleteError ? (
            <Text as="p" color="red" size="2">
              {deleteError}
            </Text>
          ) : null}
          <Flex gap="3" justify="end" mt="4">
            <AlertDialog.Cancel>
              <Button type="button" size="3" color="gray" variant="soft">
                Отмена
              </Button>
            </AlertDialog.Cancel>
            <Button
              ref={deleteConfirmButtonRef}
              type="button"
              size="3"
              color="red"
              variant="classic"
              disabled={deleteLoading}
              onClick={() => void confirmDelete()}
            >
              {deleteLoading ? 'Удаляю…' : 'Удалить'}
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  )
}
