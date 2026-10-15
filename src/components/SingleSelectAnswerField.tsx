import { Select } from '@radix-ui/themes'

export type SingleSelectAnswerFieldProps = {
  options: { id: string; label: string }[]
  /** Текущий выбранный id; undefined — пусто */
  optionId: string | undefined
  onOptionIdChange: (next: string | undefined) => void
  /** Стабильный key для Select (сброс value → placeholder). */
  selectRemountKey: string
  selectPlaceholder?: string
}

/**
 * Поле ответа «один из списка»: всегда выпадающий список.
 * «Несколько из списка» остаётся на CheckboxGroup в FillForm и RecordView.
 */
export function SingleSelectAnswerField({
  options,
  optionId,
  onOptionIdChange,
  selectRemountKey,
  selectPlaceholder = 'Выберите значение...',
}: SingleSelectAnswerFieldProps) {
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
