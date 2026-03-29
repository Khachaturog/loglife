import type { BlockConfig, BlockRow, DeedWithBlocks, RecordAnswerRow, ValueJson } from '@/types/database'
import { api } from '@/lib/api'

const MAX_BLOCK_COLUMNS = 15

function escapeCsvCell(s: string): string {
  if (/["\n\r,]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function formatValueForCsv(value: ValueJson): string {
  if (!value) return ''
  if ('number' in value && value.number !== undefined) return String(value.number)
  if ('text' in value) return value.text ?? ''
  if ('optionId' in value) return value.optionId ?? ''
  if ('optionIds' in value && Array.isArray(value.optionIds)) return value.optionIds.join('; ')
  if ('scaleValue' in value) return String(value.scaleValue)
  if ('yesNo' in value) return value.yesNo ? 'Выполнено' : 'Не выполнено'
  if ('durationHms' in value) return (value as { durationHms: string }).durationHms ?? ''
  return ''
}

function getBlockOptions(block: BlockRow): { id: string; label: string }[] {
  const fromConfig = (block.config as BlockConfig | null)?.options
  if (fromConfig?.length) return fromConfig.map((o) => ({ id: o.id, label: o.label }))
  return []
}

function formatAnswerForCsv(value: ValueJson, block: BlockRow): string {
  if (!value) return ''
  if ('optionId' in value) {
    const opts = getBlockOptions(block)
    const o = opts.find((x) => x.id === value.optionId)
    return o?.label ?? value.optionId ?? ''
  }
  if ('optionIds' in value && Array.isArray(value.optionIds)) {
    const opts = getBlockOptions(block)
    return value.optionIds.map((id) => opts.find((x) => x.id === id)?.label ?? id).join('; ')
  }
  return formatValueForCsv(value)
}

export interface ExportPeriod {
  startDate?: string
  endDate?: string
}

function isInPeriod(dateStr: string, period: ExportPeriod): boolean {
  if (period.startDate && dateStr < period.startDate) return false
  if (period.endDate && dateStr > period.endDate) return false
  return true
}

export async function exportAllToCsv(period?: ExportPeriod): Promise<string> {
  const deeds = await api.deeds.list()
  const deedsWithBlocks: DeedWithBlocks[] = []
  for (const d of deeds) {
    const full = await api.deeds.get(d.id)
    if (full) deedsWithBlocks.push(full)
  }

  const header = [
    'deed_name',
    'record_date',
    'record_time',
    ...Array.from({ length: MAX_BLOCK_COLUMNS }, (_, i) => `block_${i + 1}`),
  ].map(escapeCsvCell).join(',')

  const rows: string[] = [header]

  for (const deed of deedsWithBlocks) {
    const blocks = (deed.blocks ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
    let records = await api.deeds.records(deed.id)
    if (period && (period.startDate || period.endDate)) {
      records = records.filter((r) => isInPeriod(r.record_date, period))
    }
    const deedName = `${deed.emoji || ''} ${deed.name}`.trim()

    for (const rec of records) {
      const answersByBlock = (rec.record_answers ?? []).reduce(
        (acc, a) => ({ ...acc, [a.block_id]: a }),
        {} as Record<string, RecordAnswerRow>,
      )
      const blockValues = blocks.map((b) => {
        const ans = answersByBlock[b.id]
        const value = ans?.value_json
        return value ? formatAnswerForCsv(value, b) : ''
      })
      const cells = [
        deedName,
        rec.record_date,
        (rec.record_time ?? '').toString().slice(0, 5),
        ...blockValues,
        ...Array(Math.max(0, MAX_BLOCK_COLUMNS - blockValues.length)).fill(''),
      ].map(escapeCsvCell)
      rows.push(cells.join(','))
    }
  }

  return rows.join('\n')
}

export function downloadCsv(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
