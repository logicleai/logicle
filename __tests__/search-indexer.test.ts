import { describe, it, expect } from 'vitest'
import { diffRanges } from '@/lib/search/indexer'
import type { ConversationIndexDoc } from '@/lib/search/Index'

const doc = (id: string, lastMsgSentAt: string | null = null): ConversationIndexDoc => ({
  id,
  lastMsgSentAt,
})

describe('diffRanges', () => {
  const BATCH = 3

  it('returns null when both sides are empty', () => {
    expect(diffRanges([], [], BATCH)).toBeNull()
  })

  it('upserts all DB entries when index is empty', () => {
    const db = [doc('a', 't1'), doc('b', 't2')]
    const result = diffRanges(db, [], BATCH)
    expect(result).not.toBeNull()
    expect(result!.toUpsert).toEqual(['a', 'b'])
    expect(result!.toDelete).toEqual([])
  })

  it('deletes all index entries when DB is empty', () => {
    const idx = [doc('a', 't1'), doc('b', 't2')]
    const result = diffRanges([], idx, BATCH)
    expect(result).not.toBeNull()
    expect(result!.toUpsert).toEqual([])
    expect(result!.toDelete).toEqual(['a', 'b'])
  })

  it('produces no changes when both sides are identical', () => {
    const entries = [doc('a', 't1'), doc('b', 't2')]
    const result = diffRanges(entries, entries, BATCH)
    expect(result!.toUpsert).toEqual([])
    expect(result!.toDelete).toEqual([])
  })

  it('upserts entries whose lastMsgSentAt changed', () => {
    const db = [doc('a', 't2'), doc('b', 't1')]
    const idx = [doc('a', 't1'), doc('b', 't1')]
    const result = diffRanges(db, idx, BATCH)
    expect(result!.toUpsert).toEqual(['a'])
    expect(result!.toDelete).toEqual([])
  })

  it('upserts entries missing from the index', () => {
    const db = [doc('a', 't1'), doc('b', 't1'), doc('c', 't1')]
    const idx = [doc('a', 't1')]
    const result = diffRanges(db, idx, BATCH)
    expect(result!.toUpsert).toEqual(['b', 'c'])
    expect(result!.toDelete).toEqual([])
  })

  it('deletes entries missing from the DB', () => {
    const db = [doc('a', 't1')]
    const idx = [doc('a', 't1'), doc('b', 't1'), doc('c', 't1')]
    const result = diffRanges(db, idx, BATCH)
    expect(result!.toUpsert).toEqual([])
    expect(result!.toDelete).toEqual(['b', 'c'])
  })

  it('sets to=null when both batches are smaller than batchSize (end of data)', () => {
    const db = [doc('a'), doc('b')]
    const idx = [doc('a'), doc('b')]
    const result = diffRanges(db, idx, BATCH)
    expect(result!.to).toBeNull()
  })

  it('sets to to the last id when both full batches share the same last id', () => {
    const db = [doc('a'), doc('b'), doc('c')]
    const idx = [doc('a'), doc('b'), doc('c')]
    const result = diffRanges(db, idx, BATCH)
    expect(result!.to).toBe('c') // min('c', 'c') = 'c'
  })

  it('sets to to the lower last id when full batches diverge', () => {
    // db ends at 'd', idx ends at 'b' → to = 'b', 'c'/'d' in db are clipped
    const db = [doc('b'), doc('c'), doc('d')]  // full
    const idx = [doc('a'), doc('b'), doc('c')] // full, last='c'
    const result = diffRanges(db, idx, BATCH)
    expect(result!.to).toBe('c') // min('d', 'c') = 'c'
  })

  it('clips entries beyond `to` when one batch ends earlier', () => {
    // db is full (last='c'), idx is partial (last='b') → to='b', 'c' in db is clipped
    const db = [doc('a', 't1'), doc('b', 't1'), doc('c', 't1')]  // full batch
    const idx = [doc('a', 't1'), doc('b', 't1')]                  // partial, reached end
    const result = diffRanges(db, idx, BATCH)
    // to = min(null [idx partial], 'c' [db full last]) = null... wait
    // db.length === BATCH (3) → lastDb = 'c'
    // idx.length < BATCH (2) → lastIdx = null
    // to = getMin('c', null) = 'c'
    // So 'c' is NOT clipped - it's included. And it's in db but not idx → upsert
    expect(result!.to).toBe('c')
    expect(result!.toUpsert).toEqual(['c'])
  })

  it('clips db entries beyond to when index batch ends earlier than db batch', () => {
    // idx full (last='c'), db partial (last='b') → to = min(null, 'c') = 'c'
    // 'c' in idx but not in db → delete
    const db = [doc('a', 't1'), doc('b', 't1')]                   // partial
    const idx = [doc('a', 't1'), doc('b', 't1'), doc('c', 't1')]  // full
    const result = diffRanges(db, idx, BATCH)
    expect(result!.to).toBe('c')
    expect(result!.toDelete).toEqual(['c'])
    expect(result!.toUpsert).toEqual([])
  })

  it('handles mixed upserts and deletes in the same range', () => {
    const db  = [doc('a', 't2'), doc('c', 't1')]  // 'a' updated, 'b' gone, 'c' new
    const idx = [doc('a', 't1'), doc('b', 't1')]
    const result = diffRanges(db, idx, BATCH)
    expect(result!.toUpsert.sort()).toEqual(['a', 'c'])
    expect(result!.toDelete).toEqual(['b'])
  })
})
