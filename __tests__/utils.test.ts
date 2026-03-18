import { describe, expect, test } from 'vitest'
import { groupBy } from '@/lib/common'

describe('groupBy', () => {
  test('groups items by predicate', () => {
    const items = [
      { type: 'a', val: 1 },
      { type: 'b', val: 2 },
      { type: 'a', val: 3 },
    ]
    const result = groupBy(items, (x) => x.type)
    expect(result.get('a')).toEqual([
      { type: 'a', val: 1 },
      { type: 'a', val: 3 },
    ])
    expect(result.get('b')).toEqual([{ type: 'b', val: 2 }])
  })

  test('returns empty map for empty input', () => {
    expect(groupBy([], (x: string) => x).size).toBe(0)
  })

  test('single group when all items share the same key', () => {
    const items = ['x', 'y', 'z']
    const result = groupBy(items, () => 'same')
    expect(result.size).toBe(1)
    expect(result.get('same')).toEqual(['x', 'y', 'z'])
  })
})
