import { useMemo, useState } from 'react'
import { Avatar, Badge, Box, Button, Card, Dialog, Flex, Heading, IconButton, Select, Text } from '@radix-ui/themes'
import { Plus, X } from 'lucide-react'
import { DEED_TEMPLATES, TEMPLATE_BLOCK_LABELS, type DeedTemplate } from '@/lib/deed-templates'
import { formatNumberWithUnit, measurementUnitSymbol } from '@/lib/measurement-unit'
import styles from './DeedTemplatePicker.module.css'

interface Props {
  onChoose: (template: DeedTemplate) => void
  onBlank: () => void
}

/** Выбор не сохраняет дело: сначала показываем состав, затем открываем обычный редактор. */
export function DeedTemplatePicker({ onChoose, onBlank }: Props) {
  const [category, setCategory] = useState('all')
  const [selected, setSelected] = useState<DeedTemplate | null>(null)
  const categories = useMemo(() => Array.from(new Set(DEED_TEMPLATES.map((t) => t.category))), [])
  const visible = DEED_TEMPLATES.filter((t) => category === 'all' || t.category === category)

  return (
    <Flex direction="column" gap="4">
      <Flex direction="column" gap="2">
        <Heading as="h1" size="6">Начните с примера</Heading>
        <Text as="p" color="gray">Дело — это то, что вы хотите отслеживать. Выберите шаблон с готовыми вопросами и настройте его под себя.</Text>
      </Flex>
      <Flex direction="column" gap="3">
        <Select.Root size="3" value={category} onValueChange={setCategory}>
          <Select.Trigger aria-label="Категория шаблонов" />
          <Select.Content>
            <Select.Item value="all">Все категории</Select.Item>
            {categories.map((c) => <Select.Item key={c} value={c}>{c}</Select.Item>)}
          </Select.Content>
        </Select.Root>
      </Flex>
      <Text as="p" size="2" color="gray" role="status">Шаблоны: {visible.length} из {DEED_TEMPLATES.length}</Text>
      <Flex direction="column" gap="3">
        <Card asChild>
          <button type="button" className={styles.templateCard} onClick={onBlank}>
            <Flex align="start" gap="3">
              <Avatar size="4" radius="large" color="gray" variant="soft" fallback={<Plus size={20} />} />
              <Flex direction="column" gap="1" className={styles.cardContent}>
                <Text as="p" weight="medium">Создать с нуля</Text>
                <Text as="p" size="2" color="gray">Придумайте своё дело и добавьте вопросы, на которые хотите отвечать.</Text>
              </Flex>
            </Flex>
          </button>
        </Card>
        {visible.map((t) => (
          <Card key={t.id} asChild>
            <button type="button" className={styles.templateCard} onClick={() => setSelected(t)} aria-label={`Посмотреть шаблон «${t.name}»`}>
              <Flex align="start" gap="3">
                <Avatar size="4" radius="large" color="gray" variant="soft" fallback={t.emoji} />
                <Flex direction="column" gap="1" className={styles.cardContent}>
                  <Text as="p" weight="medium">{t.name}</Text>
                  <Text as="p" size="2" color="gray">{t.description}</Text>
                  <Text as="p" size="1" color="gray">{t.category} · Вопросов: {t.blocks.length}</Text>
                </Flex>
              </Flex>
            </button>
          </Card>
        ))}

      </Flex>
      <Dialog.Root open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <Dialog.Content maxWidth="560px">
          {selected && <>
            <Flex align="start" justify="between" gap="3" mb="2">
              <Dialog.Title mb="0">{selected.emoji} {selected.name}</Dialog.Title>
              <Dialog.Close>
                <IconButton type="button" size="3" color="gray" variant="surface" radius="full" aria-label="Закрыть шаблон" className={styles.closeButton}><X size={16} /></IconButton>
              </Dialog.Close>
            </Flex>
            <Dialog.Description size="2" color="gray">{selected.description}</Dialog.Description>
            <Flex direction="column" gap="3" my="4">
              <Heading as="h2" size="3">Что записывать</Heading>
              {selected.blocks.map((block, index) => (
                <Card key={index}>
                  <Flex direction="column" gap="2">
                    <Text weight="medium">{block.title}</Text>
                    <Box><Badge color="gray">{TEMPLATE_BLOCK_LABELS[block.block_type]}{block.config?.unit ? ` · ${measurementUnitSymbol(block.config.unit)}` : ''}</Badge></Box>
                    {block.config?.options && <Text as="p" size="2" color="gray">{block.config.options.map((o) => o.label).join(' · ')}</Text>}
                    <Text as="p" size="2" color="gray">
                      {block.default_value && 'number' in block.default_value
                        ? `По умолчанию: ${formatNumberWithUnit(block.default_value.number, block.config?.unit ?? null)}`
                        : 'Без значения по умолчанию'}
                    </Text>
                  </Flex>
                </Card>
              ))}
              <Text as="p" size="2" color="gray">Одна запись — один конкретный случай: например, почитали книгу — добавьте запись о прочитанном. Все вопросы необязательные; их можно изменить в редакторе.</Text>
            </Flex>
            <Flex direction={{ initial: 'column', xs: 'row' }} justify="end" gap="3">
              <Button type="button" size="3" variant="surface" onClick={() => { const choice = selected; setSelected(null); onChoose(choice) }}>Использовать шаблон</Button>
            </Flex>
          </>}
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  )
}
