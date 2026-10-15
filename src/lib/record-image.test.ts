import { describe, expect, it } from 'vitest'
import {
  firstRecordImagePath,
  imagePathFromValue,
  isOwnRecordImagePath,
  recordImageObjectPath,
} from '@/lib/record-image'

describe('record image paths', () => {
  it('builds and accepts a storage path', () => {
    const path = recordImageObjectPath('user', 'record', 'block')
    expect(path).toBe('user/record/block.webp')
    expect(imagePathFromValue({ imagePath: path })).toBe(path)
    expect(isOwnRecordImagePath(path, 'user')).toBe(true)
    expect(isOwnRecordImagePath(path, 'other')).toBe(false)
  })

  it('rejects a path that is not three webp segments', () => {
    expect(imagePathFromValue({ imagePath: 'only.webp' })).toBeNull()
    expect(imagePathFromValue({ imagePath: '../secret.webp' })).toBeNull()
    expect(imagePathFromValue({ text: 'no' })).toBeNull()
  })

  it('picks the first preview image by sort order', () => {
    const blocks = [
      { id: 'a', block_type: 'image', sort_order: 2, title: 'Вторая', show_in_preview: true },
      { id: 'b', block_type: 'text_paragraph', sort_order: 0, title: 'Текст' },
      { id: 'c', block_type: 'image', sort_order: 1, title: 'Первая', show_in_preview: false },
      { id: 'd', block_type: 'image', sort_order: 3, title: 'Третья' },
    ]
    const answers = [
      { block_id: 'c', value_json: { imagePath: 'u/r/c.webp' } },
      { block_id: 'd', value_json: { imagePath: 'u/r/d.webp' } },
      { block_id: 'a', value_json: { imagePath: 'u/r/a.webp' } },
    ]
    expect(firstRecordImagePath(blocks, answers)).toEqual({ path: 'u/r/a.webp', title: 'Вторая' })
  })
})
