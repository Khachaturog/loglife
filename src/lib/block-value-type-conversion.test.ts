import { describe, expect, it } from 'vitest'
import type { BlockRow } from '@/types/database'
import {
  extractFirstNumberFromString,
  migrateValueMvp,
  parseDurationHmsToSeconds,
  valueJsonMatchesBlockType,
} from '@/lib/block-value-type-conversion'

function stubBlock(overrides: Partial<BlockRow> & Pick<BlockRow, 'block_type'>): BlockRow {
  return {
    id: 'b1',
    deed_id: 'd1',
    sort_order: 0,
    title: 'Q',
    is_required: false,
    default_value: null,
    default_value_enabled: false,
    recent_suggestions_enabled: true,
    config: null,
    deleted_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

describe('parseDurationHmsToSeconds', () => {
  it('parses valid hms', () => {
    expect(parseDurationHmsToSeconds('01:30:00')).toBe(5400)
    expect(parseDurationHmsToSeconds('00:00:45')).toBe(45)
  })
  it('returns null for invalid', () => {
    expect(parseDurationHmsToSeconds('1:30:00')).toBeNull()
  })
})

describe('extractFirstNumberFromString', () => {
  it('finds first number', () => {
    expect(extractFirstNumberFromString('вес 42 кг')).toBe(42)
    expect(extractFirstNumberFromString('нет')).toBeNull()
  })
})

describe('migrateValueMvp', () => {
  it('yes_no to number', () => {
    const b = stubBlock({ block_type: 'yes_no' })
    expect(migrateValueMvp({ value: { yesNo: true }, fromType: 'yes_no', toType: 'number', sourceBlock: b }).newValue).toEqual({
      number: 1,
    })
    expect(migrateValueMvp({ value: { yesNo: false }, fromType: 'yes_no', toType: 'number', sourceBlock: b }).newValue).toEqual({
      number: 0,
    })
  })
  it('scale to text N из M', () => {
    const b = stubBlock({ block_type: 'scale', config: { divisions: 5, labels: [] } })
    expect(migrateValueMvp({ value: { scaleValue: 3 }, fromType: 'scale', toType: 'text_paragraph', sourceBlock: b }).newValue).toEqual({
      text: '3 из 5',
    })
  })
  it('text to url copies the string', () => {
    const b = stubBlock({ block_type: 'text_paragraph' })
    expect(
      migrateValueMvp({
        value: { text: 'https://example.com/a' },
        fromType: 'text_paragraph',
        toType: 'url',
        sourceBlock: b,
      }).newValue,
    ).toEqual({ url: 'https://example.com/a' })
  })
  it('url to text copies the string', () => {
    const b = stubBlock({ block_type: 'url' })
    expect(
      migrateValueMvp({
        value: { url: 'https://example.com/a' },
        fromType: 'url',
        toType: 'text_paragraph',
        sourceBlock: b,
      }).newValue,
    ).toEqual({ text: 'https://example.com/a' })
  })
  it('duration to number in minutes', () => {
    const b = stubBlock({ block_type: 'duration' })
    const r = migrateValueMvp({
      value: { durationHms: '01:00:00' },
      fromType: 'duration',
      toType: 'number',
      sourceBlock: b,
      durationNumberUnit: 'minutes',
    })
    expect(r.newValue).toEqual({ number: 60 })
  })
})

describe('valueJsonMatchesBlockType', () => {
  it('detects mismatch when block is text but value is number shape', () => {
    const b = stubBlock({ block_type: 'text_paragraph' })
    expect(valueJsonMatchesBlockType(b, { number: 5 })).toBe(false)
  })
  it('accepts matching shape', () => {
    const b = stubBlock({ block_type: 'number' })
    expect(valueJsonMatchesBlockType(b, { number: 5 })).toBe(true)
  })
  it('url shape does not match a text block', () => {
    const b = stubBlock({ block_type: 'text_paragraph' })
    expect(valueJsonMatchesBlockType(b, { url: 'https://example.com' })).toBe(false)
  })
  it('url shape matches a url block', () => {
    const b = stubBlock({ block_type: 'url' })
    expect(valueJsonMatchesBlockType(b, { url: 'https://example.com' })).toBe(true)
  })
})
