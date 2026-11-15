import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEED_TEMPLATES, createBlocksFromTemplate } from './deed-templates.ts'
import { normalizeDefaultValueForBlock } from './block-default-value.ts'

test('все 38 шаблонов дают пригодные к сохранению блоки и валидные дефолты', () => {
  assert.equal(DEED_TEMPLATES.length, 38)
  assert.equal(new Set(DEED_TEMPLATES.map((t) => t.id)).size, 38)
  for (const template of DEED_TEMPLATES) {
    assert.ok(template.name.trim() && template.description.trim() && template.category.trim())
    const blocks = createBlocksFromTemplate(template)
    assert.ok(blocks.length > 0)
    for (const block of blocks) {
      assert.ok(block.title.trim())
      assert.equal(block.is_required, false)
      if (block.block_type === 'single_select' || block.block_type === 'multi_select') {
        assert.ok(block.config?.options?.length)
        assert.ok(block.config.options.every((o, i) => o.label.trim() && o.sort_order === i))
        assert.equal(new Set(block.config.options.map((o) => o.id)).size, block.config.options.length)
      }
      if (block.default_value_enabled) {
        assert.deepEqual(normalizeDefaultValueForBlock(block, block.default_value), block.default_value)
      } else assert.equal(block.default_value, null)
    }
  }
  assert.deepEqual(DEED_TEMPLATES.filter((t) => t.blocks.some((b) => b.default_value)).map((t) => t.id), ['water', 'coffee'])
})

test('изменение вопросов, вариантов и единиц одного дела не затрагивает каталог или другое дело', () => {
  const meal = DEED_TEMPLATES.find((t) => t.id === 'meal')!
  const snapshot = JSON.stringify(meal)
  const first = createBlocksFromTemplate(meal)
  const second = createBlocksFromTemplate(meal)
  assert.notEqual(first[0].config!.options![0].id, second[0].config!.options![0].id)
  first[0].config!.options![0].label = 'Изменено'
  first[0].title = 'Другой вопрос'
  assert.equal(JSON.stringify(meal), snapshot)
  assert.equal(second[0].config!.options![0].label, 'Завтрак')

  const water = DEED_TEMPLATES.find((t) => t.id === 'water')!
  const waterBlocks = createBlocksFromTemplate(water)
  waterBlocks[0].config!.unit = { kind: 'preset', code: 'l' }
  waterBlocks[0].default_value = { number: 1 }
  assert.deepEqual(createBlocksFromTemplate(water)[0].default_value, { number: 250 })
  assert.deepEqual(water.blocks[0].config!.unit, { kind: 'preset', code: 'ml' })
})
