import type { EvaluationArtifact, RunResult } from './types'

/**
 * Loads either the current versioned artifact or the raw RunResult[] files produced by earlier
 * versions of the runner. The latter compatibility path makes old measurements re-renderable.
 */
export const readRunsArtifact = (value: unknown): Pick<EvaluationArtifact, 'metadata' | 'runs'> => {
  if (Array.isArray(value)) {
    return {
      metadata: {
        provider: 'unknown',
        assistantModel: 'unknown',
        userModel: 'unknown',
        baselineArm: 'all-in-context',
        arms: [],
        scenarios: [],
        repeat: 0,
      },
      runs: value as RunResult[],
    }
  }

  if (
    !value ||
    typeof value !== 'object' ||
    (value as { version?: unknown }).version !== 1 ||
    !Array.isArray((value as { runs?: unknown }).runs)
  ) {
    throw new Error('Runs artifact must be a version 1 evaluation artifact or a RunResult array')
  }

  const artifact = value as EvaluationArtifact
  return { metadata: artifact.metadata, runs: artifact.runs }
}
