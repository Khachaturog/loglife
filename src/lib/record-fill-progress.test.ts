import { describe, expect, it } from 'vitest'
import { recordFillProgress } from '@/lib/format-utils'
import type { BlockRow } from '@/types/database'

type CountBlock = Pick<BlockRow, 'id' | 'deleted_at' | 'show_in_preview'>

function block(id: string, extra: Partial<CountBlock> = {}): CountBlock {
  return { id, deleted_at: null, show_in_preview: true, ...extra }
}

describe('recordFillProgress', () => {
  it('не считает пустой текст и ноль, а «нет» считает ответом', () => {
    const blocks = [block('text'), block('num'), block('yn')]
    const progress = recordFillProgress(blocks, [
      { block_id: 'text', value_json: { text: '   ' } },
      { block_id: 'num', value_json: { number: 0 } },
      { block_id: 'yn', value_json: { yesNo: false } },
    ])
    expect(progress).toEqual({ filled: 1, total: 3 })
  })

  it('включает скрытый из превью блок и пропускает удалённый', () => {
    const blocks = [
      block('shown'),
      block('hidden', { show_in_preview: false }),
      block('gone', { deleted_at: '2020-01-01T00:00:00Z' }),
    ]
    const progress = recordFillProgress(blocks, [
      { block_id: 'hidden', value_json: { text: 'есть' } },
      { block_id: 'gone', value_json: { number: 5 } },
    ])
    expect(progress).toEqual({ filled: 1, total: 2 })
  })

  it('не возвращает подпись, когда пустых полей нет или блоков нет', () => {
    const blocks = [block('a'), block('b')]
    expect(
      recordFillProgress(blocks, [
        { block_id: 'a', value_json: { url: 'https://example.com' } },
        { block_id: 'b', value_json: { scaleValue: 3 } },
      ]),
    ).toBeNull()
    expect(recordFillProgress([], [])).toBeNull()
    expect(recordFillProgress([block('gone', { deleted_at: '2020-01-01T00:00:00Z' })], [])).toBeNull()
  })

  it('с showWhenComplete возвращает и полную запись', () => {
    const blocks = [block('a'), block('b')]
    expect(
      recordFillProgress(
        blocks,
        [
          { block_id: 'a', value_json: { text: 'есть' } },
          { block_id: 'b', value_json: { number: 2 } },
        ],
        { showWhenComplete: true },
      ),
    ).toEqual({ filled: 2, total: 2 })
  })
})
