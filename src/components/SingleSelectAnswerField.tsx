import { flushSync } from 'react-dom'
import { CheckboxGroup, Select } from '@radix-ui/themes'
import type { SingleSelectUiMode } from '@/types/database'

export type SingleSelectAnswerFieldProps = {
  uiMode: SingleSelectUiMode
  options: { id: string; label: string }[]
  /** Текущий выбранный id; undefined — пусто */
  optionId: string | undefined
  onOptionIdChange: (next: string | undefined) => void
  /** Стабильный key для Select (сброс value → placeholder). */
  selectRemountKey: string
  selectPlaceholder?: string
}

/**
 * Единое поле ответа «один из списка»: Select или CheckboxGroup (один активный), как в конфиге блока.
 * Держать в синхроне с multi_select на FillForm / RecordView по стилям чекбоксов.
 */
export function SingleSelectAnswerField({
  uiMode,
  options,
  optionId,
  onOptionIdChange,
  selectRemountKey,
  selectPlaceholder = 'Выберите значение...',
}: SingleSelectAnswerFieldProps) {
  if (uiMode === 'select') {
    return (
      <Select.Root
        key={selectRemountKey}
        size="3"
        value={optionId || undefined}
        onValueChange={(v) => onOptionIdChange(v)}
      >
        <Select.Trigger placeholder={selectPlaceholder} />
        <Select.Content>
          {options.map((opt) => (
            <Select.Item key={opt.id} value={opt.id}>
              {opt.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    )
  }

  const asArray = optionId ? [optionId] : []

  return (
    <CheckboxGroup.Root
      size="3"
      value={asArray}
      onValueChange={(nextValues) => {
        flushSync(() => {
          if (nextValues.length === 0) {
            onOptionIdChange(undefined)
            return
          }
          if (nextValues.length === 1) {
            onOptionIdChange(nextValues[0])
            return
          }
          // Один выбранный id в value_json: при втором «включении» без снятия первого — оставляем только новый.
          const prevSet = new Set(optionId ? [optionId] : [])
          const newly = nextValues.filter((id) => !prevSet.has(id))
          const pick = newly.length === 1 ? newly[0] : nextValues[nextValues.length - 1]
          onOptionIdChange(pick)
        })
      }}
    >
        {options.map((opt) => (
          <CheckboxGroup.Item
            key={opt.id}
            value={opt.id}
          >
            {opt.label}
          </CheckboxGroup.Item>
        ))}
    </CheckboxGroup.Root>
  )
}
