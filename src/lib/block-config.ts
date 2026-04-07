import type { BlockConfig, SingleSelectUiMode } from '@/types/database'

/** Дефолт до/вне миграции и для неизвестных значений в JSON. */
export function getSingleSelectUi(config: BlockConfig | null | undefined): SingleSelectUiMode {
  const v = config?.singleSelectUi
  if (v === 'checkbox') return 'checkbox'
  return 'select'
}
