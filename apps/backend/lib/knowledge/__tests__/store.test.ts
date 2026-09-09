import { describe, expect, it, vi } from 'vitest'

vi.mock('@/db/database', () => ({ db: {} }))

const { computeConfigHash } = await import('@/backend/lib/knowledge/store')

const question = (id: string, prompt: string) => ({ id, title: id, prompt })

describe('computeConfigHash', () => {
  it('is stable for the same questions', () => {
    const questions = [question('a', 'What?'), question('b', 'Who?')]
    expect(computeConfigHash(questions)).toBe(computeConfigHash([...questions]))
  })

  it('ignores the order of the questions', () => {
    const left = [question('a', 'What?'), question('b', 'Who?')]
    const right = [question('b', 'Who?'), question('a', 'What?')]
    expect(computeConfigHash(left)).toBe(computeConfigHash(right))
  })

  it('ignores the title, which does not affect ingestion', () => {
    const left = [{ id: 'a', title: 'Topics', prompt: 'What?' }]
    const right = [{ id: 'a', title: 'Subjects', prompt: 'What?' }]
    expect(computeConfigHash(left)).toBe(computeConfigHash(right))
  })

  it('changes when a prompt changes', () => {
    expect(computeConfigHash([question('a', 'What?')])).not.toBe(
      computeConfigHash([question('a', 'Which?')])
    )
  })

  it('changes when a question is added or removed', () => {
    const one = computeConfigHash([question('a', 'What?')])
    const two = computeConfigHash([question('a', 'What?'), question('b', 'Who?')])
    expect(one).not.toBe(two)
    expect(computeConfigHash([])).not.toBe(one)
  })
})
