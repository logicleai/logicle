import * as ai from 'ai'
import * as dto from '@/types/dto'
import { LanguageModelV3 } from '@ai-sdk/provider'
import { logger } from '@/lib/logging'
import { findReasonableSummarizationBackend } from './summarizer'

interface DurableFact {
  fact: string
  confidence: 'high' | 'medium' | 'low'
}

interface RehydrationHint {
  trigger: string
  reason: string
}

interface TurnMemoryOutput {
  userIntent: string
  answerSummary: string
  durableFacts: DurableFact[]
  openQuestions: string[]
  decisions: string[]
  rehydrationHints: RehydrationHint[]
  warnings: string[]
}

const DISTILL_SYSTEM_PROMPT = `You are compressing an AI assistant turn for future context efficiency.

You receive the user's message, the assistant's final answer, and the tool calls made during the turn.

Your job: create a compact memory of this turn as valid JSON only.

Rules:
1. Do not copy large tool outputs verbatim.
2. Preserve only facts that may matter in future turns.
3. Preserve unresolved questions, decisions, and user constraints.
4. Keep the memory compact — prefer short, dense summaries.
5. Do not invent facts.
6. Output valid JSON only, matching the schema exactly.

Output schema:
{
  "userIntent": "string — what the user was trying to achieve",
  "answerSummary": "string — compact summary of the assistant's final answer",
  "durableFacts": [{ "fact": "string", "confidence": "high|medium|low" }],
  "openQuestions": ["string"],
  "decisions": ["string"],
  "rehydrationHints": [{ "trigger": "string — when this should be recalled", "reason": "string" }],
  "warnings": ["string — unsupported or uncertain claims"]
}`

function buildDistillationInput(
  userMessage: dto.UserMessage,
  finalAnswer: string,
  toolMessages: dto.ToolMessage[]
): string {
  const toolSummary = toolMessages.flatMap((msg) =>
    msg.parts
      .filter((p): p is dto.ToolCallResultPart => p.type === 'tool-result')
      .map((p) => {
        const resultText =
          p.result.type === 'text' || p.result.type === 'error-text'
            ? p.result.value
            : JSON.stringify(p.result.value)
        const truncated =
          resultText.length > 4000 ? `${resultText.slice(0, 4000)}…[truncated]` : resultText
        return `Tool: ${p.toolName}\nResult: ${truncated}`
      })
  )

  return `<user_message>\n${userMessage.content}\n</user_message>\n\n<assistant_final_answer>\n${finalAnswer}\n</assistant_final_answer>\n\n<tool_outputs>\n${toolSummary.join('\n\n')}\n</tool_outputs>`
}

function parseTurnMemoryOutput(raw: string): TurnMemoryOutput | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    return {
      userIntent: typeof obj.userIntent === 'string' ? obj.userIntent : '',
      answerSummary: typeof obj.answerSummary === 'string' ? obj.answerSummary : '',
      durableFacts: Array.isArray(obj.durableFacts) ? (obj.durableFacts as DurableFact[]) : [],
      openQuestions: Array.isArray(obj.openQuestions) ? (obj.openQuestions as string[]) : [],
      decisions: Array.isArray(obj.decisions) ? (obj.decisions as string[]) : [],
      rehydrationHints: Array.isArray(obj.rehydrationHints)
        ? (obj.rehydrationHints as RehydrationHint[])
        : [],
      warnings: Array.isArray(obj.warnings) ? (obj.warnings as string[]) : [],
    }
  } catch {
    return null
  }
}

export async function distillAndSaveTurn({
  conversationId,
  userMessage,
  finalAnswer,
  toolMessages,
  currentLanguageModel,
}: {
  conversationId: string
  userMessage: dto.UserMessage
  finalAnswer: string
  toolMessages: dto.ToolMessage[]
  currentLanguageModel: LanguageModelV3
}): Promise<void> {
  const { saveTurnMemory } = await import('@/models/turn-memory')
  try {
    const languageModel =
      (await findReasonableSummarizationBackend()) ?? currentLanguageModel

    const input = buildDistillationInput(userMessage, finalAnswer, toolMessages)

    const messages: ai.ModelMessage[] = [
      { role: 'system', content: DISTILL_SYSTEM_PROMPT },
      { role: 'user', content: input },
    ]

    const stream = ai.streamText({ model: languageModel, messages, temperature: 0 })
    let raw = ''
    for await (const chunk of stream.textStream) {
      raw += chunk
    }

    // Strip markdown code fences if the model wrapped the JSON
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonText = jsonMatch ? jsonMatch[1]! : raw

    const memory = parseTurnMemoryOutput(jsonText.trim())
    if (!memory) {
      logger.warn('Turn memory distillation produced unparseable output', { conversationId })
      await saveFallbackTurnMemory(saveTurnMemory, conversationId, userMessage, finalAnswer)
      return
    }

    await saveTurnMemory({
      conversationId,
      userMessageId: userMessage.id,
      ...memory,
    })
  } catch (err) {
    logger.error('Turn memory distillation failed', { conversationId, err })
    await saveFallbackTurnMemory(saveTurnMemory, conversationId, userMessage, finalAnswer)
  }
}

async function saveFallbackTurnMemory(
  saveTurnMemory: (typeof import('@/models/turn-memory'))['saveTurnMemory'],
  conversationId: string,
  userMessage: dto.UserMessage,
  finalAnswer: string
): Promise<void> {
  try {
    await saveTurnMemory({
      conversationId,
      userMessageId: userMessage.id,
      userIntent: userMessage.content.slice(0, 500),
      answerSummary: finalAnswer.slice(0, 1000),
      durableFacts: [],
      openQuestions: [],
      decisions: [],
      rehydrationHints: [],
      warnings: ['Turn distillation failed; this is a fallback summary.'],
    })
  } catch (err) {
    logger.error('Fallback turn memory save also failed', { conversationId, err })
  }
}

export function shouldDistillTurn(turnMessages: dto.Message[]): boolean {
  const toolMessages = turnMessages.filter((m): m is dto.ToolMessage => m.role === 'tool')
  if (toolMessages.length === 0) return false

  const totalResultLength = toolMessages
    .flatMap((m) => m.parts.filter((p): p is dto.ToolCallResultPart => p.type === 'tool-result'))
    .reduce((sum, p) => {
      const v = p.result.value
      return sum + (typeof v === 'string' ? v.length : JSON.stringify(v).length)
    }, 0)

  // Distill if there are tool calls with non-trivial output (> ~500 chars ≈ ~125 tokens)
  return totalResultLength > 500
}
