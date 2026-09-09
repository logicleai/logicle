import { describe, expect, it } from 'vitest'
import { readRunsArtifact } from '@/backend/lib/eval/artifact'
import type { EvaluationArtifact, RunResult } from '@/backend/lib/eval/types'

const run = { scenarioId: 's', armName: 'a' } as RunResult

describe('readRunsArtifact', () => {
  it('loads the versioned artifact format', () => {
    const artifact: EvaluationArtifact = {
      version: 1,
      createdAt: '2026-09-09T00:00:00.000Z',
      metadata: {
        provider: 'openai',
        assistantModel: 'gpt-4o-mini',
        userModel: 'gpt-4o-mini',
        baselineArm: 'a',
        arms: ['a'],
        scenarios: ['s'],
        repeat: 3,
      },
      runs: [run],
    }
    expect(readRunsArtifact(artifact)).toEqual({ metadata: artifact.metadata, runs: [run] })
  })

  it('keeps legacy raw run arrays re-renderable', () => {
    expect(readRunsArtifact([run]).runs).toEqual([run])
  })

  it('rejects unknown input instead of silently reporting nonsense', () => {
    expect(() => readRunsArtifact({ version: 2, runs: [] })).toThrow('Runs artifact')
  })
})
