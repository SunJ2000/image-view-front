import { describe, expect, it } from 'vitest'
import { formatBytes, formatDate, parsePage } from '../src/lib/format'

describe('display and route helpers', () => {
  it.each([undefined, null, 'invalid', '-1', '0', '1.5', '1000001'])(
    'falls back to page one for %s',
    (value) => {
      expect(parsePage(value)).toBe(1)
    },
  )
  it('accepts valid page numbers', () => {
    expect(parsePage('24')).toBe(24)
    expect(parsePage('1000000')).toBe(1_000_000)
  })
  it('formats actual file sizes', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })
  it('handles missing dates without throwing', () => {
    expect(formatDate('not-a-date')).toBe('日期未知')
    expect(formatDate('2026-10-12T08:00:00Z')).toBe('2026.10.12')
  })
})
