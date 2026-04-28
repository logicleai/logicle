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
