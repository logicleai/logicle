import * as dto from '@/types/dto'

export const toUpdateableAssistantDraft = (
  assistant: dto.AssistantDraft
): dto.UpdateableAssistantDraft => ({
  backendId: assistant.backendId,
  description: assistant.description,
  files: assistant.files,
  iconUri: assistant.iconUri,
  model: assistant.model,
  name: assistant.name,
  prompts: assistant.prompts,
  reasoning_effort: assistant.reasoning_effort,
  subAssistants: assistant.subAssistants ?? [],
  systemPrompt: assistant.systemPrompt,
  tags: assistant.tags,
  temperature: assistant.temperature,
  tokenLimit: assistant.tokenLimit,
  tools: assistant.tools,
})

export const normalizeUpdateableAssistantDraft = (
  assistant: dto.UpdateableAssistantDraft
): dto.UpdateableAssistantDraft => ({
  backendId: assistant.backendId,
  description: assistant.description,
  files: assistant.files ?? [],
  iconUri: assistant.iconUri ?? null,
  model: assistant.model,
  name: assistant.name,
  prompts: assistant.prompts ?? [],
  reasoning_effort: assistant.reasoning_effort ?? null,
  subAssistants: [...(assistant.subAssistants ?? [])].sort(),
  systemPrompt: assistant.systemPrompt,
  tags: [...(assistant.tags ?? [])].sort(),
  temperature: assistant.temperature === undefined ? undefined : Number(assistant.temperature),
  tokenLimit: assistant.tokenLimit === undefined ? undefined : Number(assistant.tokenLimit),
  tools: [...(assistant.tools ?? [])].sort(),
})

export const updateableAssistantDraftEqual = (
  left: dto.UpdateableAssistantDraft,
  right: dto.UpdateableAssistantDraft
) =>
  JSON.stringify(normalizeUpdateableAssistantDraft(left)) ===
  JSON.stringify(normalizeUpdateableAssistantDraft(right))

export type UpdateableAssistantDraftField = keyof dto.UpdateableAssistantDraft

const trackedDraftFields: UpdateableAssistantDraftField[] = [
  'name',
  'description',
  'model',
  'backendId',
  'systemPrompt',
  'tools',
  'files',
  'tags',
  'prompts',
  'temperature',
  'tokenLimit',
  'reasoning_effort',
  'iconUri',
  'subAssistants',
]

export const getChangedAssistantDraftFields = (
  left: dto.UpdateableAssistantDraft,
  right: dto.UpdateableAssistantDraft
): UpdateableAssistantDraftField[] => {
  const normalizedLeft = normalizeUpdateableAssistantDraft(left)
  const normalizedRight = normalizeUpdateableAssistantDraft(right)
  return trackedDraftFields.filter((field) => {
    return JSON.stringify(normalizedLeft[field]) !== JSON.stringify(normalizedRight[field])
  })
}

const ignoredTopLevelDraftFields = new Set<keyof dto.AssistantDraft>([
  'id',
  'assistantId',
  'createdAt',
  'updatedAt',
  'owner',
  'sharing',
  'provisioned',
  'pendingChanges',
  'versionName',
])

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const normalizeAssistantDraftForDiff = (
  draft: dto.AssistantDraft
): Record<string, unknown> => {
  const updateable = normalizeUpdateableAssistantDraft(toUpdateableAssistantDraft(draft))
  return {
    ...draft,
    ...updateable,
  }
}

const deepDiffPaths = (
  left: unknown,
  right: unknown,
  path: string[] = []
): string[][] => {
  if (left === right) return []
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return [path]
    const changes: string[][] = []
    for (let i = 0; i < left.length; i += 1) {
      changes.push(...deepDiffPaths(left[i], right[i], [...path, String(i)]))
    }
    return changes
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    const changes: string[][] = []
    for (const key of keys) {
      changes.push(...deepDiffPaths(left[key], right[key], [...path, key]))
    }
    return changes
  }
  return [path]
}

export const getChangedAssistantDraftTopLevelFields = (
  left: dto.AssistantDraft,
  right: dto.AssistantDraft
): string[] => {
  const normalizedLeft = normalizeAssistantDraftForDiff(left)
  const normalizedRight = normalizeAssistantDraftForDiff(right)
  const paths = deepDiffPaths(normalizedLeft, normalizedRight)
  const changedTopLevel = new Set<string>()
  for (const path of paths) {
    const top = path[0]
    if (!top) continue
    if (ignoredTopLevelDraftFields.has(top as keyof dto.AssistantDraft)) continue
    changedTopLevel.add(top)
  }
  return [...changedTopLevel]
}
