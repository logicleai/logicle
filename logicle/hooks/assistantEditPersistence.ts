// hooks/assistantEditPersistence.ts
// Minimal, per-user container for assistant edit drafts.

export type DraftEntry = {
  text: string
  updatedAt: number
}

export type DraftContainer = Record<string, DraftEntry> // key: `${messageId}:${partIndex}`

const buildContainerKey = (userId?: string) => `assistantDrafts/${userId || 'anon'}`

const safeParse = <T>(raw: string | null, fallback: T): T => {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

const readContainer = (userId?: string): DraftContainer => {
  if (typeof window === 'undefined') return {}
  const key = buildContainerKey(userId)
  return safeParse<DraftContainer>(localStorage.getItem(key), {})
}

const writeContainer = (userId: string | undefined, value: DraftContainer) => {
  if (typeof window === 'undefined') return
  const key = buildContainerKey(userId)
  localStorage.setItem(key, JSON.stringify(value))
}

/** Get a single draft’s key within the container. */
export const draftIdFor = (messageId: string, partIndex: number) => `${messageId}:${partIndex}`

/** Read a single draft entry (if any). */
export const readDraft = (
  userId: string | undefined,
  messageId: string,
  partIndex: number
): DraftEntry | undefined => {
  const container = readContainer(userId)
  return container[draftIdFor(messageId, partIndex)]
}

/** Upsert a draft entry. */
export const writeDraft = (
  userId: string | undefined,
  messageId: string,
  partIndex: number,
  text: string
) => {
  const container = readContainer(userId)
  container[draftIdFor(messageId, partIndex)] = { text, updatedAt: Date.now() }
  writeContainer(userId, container)
}

/** Remove a single draft entry (used after successful commit). */
export const clearDraft = (userId: string | undefined, messageId: string, partIndex: number) => {
  const container = readContainer(userId)
  const id = draftIdFor(messageId, partIndex)
  if (container[id]) {
    delete container[id]
    writeContainer(userId, container)
  }
}

/**
 * Prune the container for a user.
 * - Remove entries older than `maxAgeMs`
 * - Optionally keep only the most recent `maxEntries`
 * Returns the number of removed entries.
 */
export const pruneAssistantEditState = (
  userId: string | undefined,
  opts: { maxAgeMs?: number; maxEntries?: number } = {}
): number => {
  const { maxAgeMs, maxEntries } = opts
  const container = readContainer(userId)
  const now = Date.now()

  // 1) Age-based pruning
  let entries = Object.entries(container).filter(([_, v]) =>
    typeof maxAgeMs === 'number' ? now - (v?.updatedAt || 0) <= maxAgeMs : true
  )

  // 2) Count-based pruning — keep the most recent N
  if (typeof maxEntries === 'number' && entries.length > maxEntries) {
    entries.sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
    entries = entries.slice(0, maxEntries)
  }

  const pruned: DraftContainer = Object.fromEntries(entries)
  const removed = Object.keys(container).length - Object.keys(pruned).length
  if (removed > 0) writeContainer(userId, pruned)
  return removed
}

/**
 * React hook for assistant edit state.
 * - Hydrates initial text from the user’s container if present, else uses `initialText`
 * - Persists on change
 * - Exposes `clear()` to be called after successful commit (or on cancel, if you want)
 */
import { useEffect, useMemo, useState } from 'react'

export const useAssistantEditState = (args: {
  userId?: string
  messageId: string
  partIndex: number
  initialText: string
}) => {
  const { userId, messageId, partIndex, initialText } = args
  const id = useMemo(() => draftIdFor(messageId, partIndex), [messageId, partIndex])

  const [text, setText] = useState<string>(() => {
    if (typeof window === 'undefined') return initialText
    const existing = readDraft(userId, messageId, partIndex)?.text
    return existing ?? initialText
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    // re-read to avoid clobbering other tabs quickly editing the same draft
    writeDraft(userId, messageId, partIndex, text)
  }, [userId, messageId, partIndex, text])

  const clear = () => clearDraft(userId, messageId, partIndex)

  return { text, setText, clear, draftId: id, containerKey: buildContainerKey(userId) }
}
