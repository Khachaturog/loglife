import { useEffect, useMemo, useState } from 'react'
import { MinusIcon, PlusIcon } from '@radix-ui/react-icons'
import { Avatar, Box, Button, Card, Flex, IconButton, Select, Text } from '@radix-ui/themes'
import { AppBar } from '@/components/AppBar'
import { PageLoading } from '@/components/PageLoading'
import { api } from '@/lib/api'
import { useHoldRepeat } from '@/lib/useHoldRepeat'
import { todayLocalISO, nowTimeLocal } from '@/lib/format-utils'
import type { BlockRow, DeedWithBlocks } from '@/types/database'
import layoutStyles from '@/styles/layout.module.css'
import styles from './ClickerPage.module.css'

/** Дела, у которых ровно один блок типа number */
function deedsWithSingleNumberBlock(deeds: DeedWithBlocks[]): DeedWithBlocks[] {
  return deeds.filter((d) => {
    const blocks = (d.blocks ?? []).filter((b: BlockRow) => !b.deleted_at)
    return blocks.length === 1 && blocks[0].block_type === 'number'
  })
}

/**
 * Страница виджета «Кликер».
 * Счётчик с сохранением в дело с одним блоком «Число».
 */
export function ClickerPage() {
  // --- Состояние ---
  const [deeds, setDeeds] = useState<DeedWithBlocks[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDeedId, setSelectedDeedId] = useState<string>('')
  const [count, setCount] = useState(0)
  const [saving, setSaving] = useState(false)

  const holdPlus = useHoldRepeat(() => setCount((c) => c + 1))
  const holdMinus = useHoldRepeat(() => setCount((c) => Math.max(0, c - 1)))

  // --- Загрузка дел ---
  useEffect(() => {
    let cancelled = false
    api.deeds
      .listWithBlocks()
      .then((data) => {
        if (!cancelled) setDeeds(data)
      })
      .catch(() => {
        if (!cancelled) setDeeds([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  // --- Вычисляемые данные ---
  const clickerDeeds = useMemo(() => deedsWithSingleNumberBlock(deeds), [deeds])
  const selectedDeed = useMemo(
    () => clickerDeeds.find((d) => d.id === selectedDeedId) ?? null,
    [clickerDeeds, selectedDeedId],
  )
  const numberBlock = selectedDeed?.blocks?.[0] ?? null

  const handleSave = async () => {
    if (!selectedDeedId || !numberBlock || saving) return
    setSaving(true)
    try {
      await api.deeds.createRecord(selectedDeedId, {
        record_date: todayLocalISO(),
        record_time: nowTimeLocal(),
        answers: { [numberBlock.id]: { number: count } },
      })
      setCount(0)
    } catch (err) {
      console.error(err instanceof Error ? err.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  // --- Рендер ---
  if (loading) {
    return <PageLoading title="" backHref="/widgets" titleReserve />
  }

  return (
    <Flex direction="column" className={`${layoutStyles.pageContainer} ${styles.pageRoot}`}>
      <Box className={styles.container}>
        
        <AppBar backHref="/widgets" title="Кликер" />

      {/* Шаг 1: выбор дела карточками (при входе) */}
      {!selectedDeedId && clickerDeeds.length > 0 && (
        <Flex direction="column" gap="3">

          <Flex direction="column" gap="0">
            <Text size="5" weight="medium">Выберите дело</Text>
            <Text size="2" color="gray">Доступны дела только с одним блоком «Число»</Text>
          </Flex>

          <Flex direction="column" gap="2">
            {clickerDeeds.map((deed) => (
              <Card
                key={deed.id}
                className={styles.deedCard}
                asChild
              >
                <button
                  type="button"
                  onClick={() => setSelectedDeedId(deed.id)}
                  aria-label={`Выбрать ${deed.name}`}
                >
                  <Flex align="center" gap="2">
                  <Avatar
                  size="3"
                  radius="large"
                  color="gray"
                  variant="soft"
                  fallback={deed.emoji || '📋'}
                  />
                    <Text size="3" weight="medium">{deed.name}</Text>
                  </Flex>
                </button>
              </Card>
            ))}
          </Flex>
        </Flex>
      )}

      {clickerDeeds.length === 0 && !loading && (
        <Text as="p" color="gray" mb="4">
          Нет подходящих дел. Создайте дело с одним блоком «Число».
        </Text>
      )}

      {/* Шаг 2: Select + область счётчика (после выбора дела) */}
      {selectedDeed && (
        <>
        <Flex direction="column" gap="1" mb="4">
          <Text size="2" color="gray">Дело</Text>
          <Select.Root
            size="3"
            value={selectedDeedId}
            onValueChange={(v) => setSelectedDeedId(v)}
          >
            <Select.Trigger id="deed-select" />
            <Select.Content>
              {clickerDeeds.map((d) => (
                <Select.Item key={d.id} value={d.id}>
                  {d.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>

        <Flex direction="column" gap="4" className={styles.counterContainer}>
          {/* Область счётчика: клик или удержание для инкремента */}
          <Box
            asChild
            className={styles.counterArea}
            >
            <div
              role="button"
              tabIndex={0}
              onPointerDown={holdPlus.handlePointerDown}
              onPointerUp={holdPlus.handlePointerUp}
              onPointerLeave={holdPlus.handlePointerUp}
              onPointerCancel={holdPlus.handlePointerUp}
              onContextMenu={(e) => e.preventDefault()}
              onKeyDown={(e) => {
                if (e.key === ' ' || e.key === 'Enter') {
                  e.preventDefault()
                  setCount((c) => c + 1)
                }
              }}
            >
              <Flex direction="column" align="center" className={styles.counterContent}>
                {count}
                <Text size="2" color="gray" weight="regular"
                align="center">
                  Тапните или удерживайте 
                  <br />
                  для увеличения значения
                  </Text>
              </Flex>
            </div>
          </Box>
          {/* Кнопки минус/плюс — тап или удержание */}
          <Flex gap="2" justify="center" mb="4" ml="8" mr="8">
            <IconButton
              className={styles.counterButton}
              size="4"
              variant="soft"
              onPointerDown={holdMinus.handlePointerDown}
              onPointerUp={holdMinus.handlePointerUp}
              onPointerLeave={holdMinus.handlePointerUp}
              onPointerCancel={holdMinus.handlePointerUp}
              disabled={count === 0}
              aria-label="Уменьшить"
            >
              <MinusIcon width={24} height={24} />
            </IconButton>
            <IconButton
              className={styles.counterButton}
              size="4"
              variant="soft"
              onPointerDown={holdPlus.handlePointerDown}
              onPointerUp={holdPlus.handlePointerUp}
              onPointerLeave={holdPlus.handlePointerUp}
              onPointerCancel={holdPlus.handlePointerUp}
              aria-label="Увеличить"
            >
              <PlusIcon width={24} height={24} />
            </IconButton>
          </Flex>
          <Button 
            size="4" 
            onClick={handleSave} 
            disabled={saving || count === 0}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </Flex>
        </>
      )}
      </Box>
    </Flex>
  )
}
