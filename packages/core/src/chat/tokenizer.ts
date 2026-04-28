import * as dto from '@/types/dto'
import { getEncoding, Tiktoken } from 'js-tiktoken'
import { LlmModel, TokenizerStrategy, defaultTokenizerByOwner } from '../models'

const encodingCache = new Map<'cl100k_base' | 'o200k_base', Tiktoken>()

const getEncodingCached = (name: 'cl100k_base' | 'o200k_base') => {
  const cached = encodingCache.get(name)
  if (cached) return cached
  const encoding = getEncoding(name)
  encodingCache.set(name, encoding)
  return encoding
}

export const countTextWithTokenizer = (tokenizer: TokenizerStrategy, text: string) => {
  if (tokenizer === 'approx_4chars') {
    return Math.ceil(text.length / 4)
  }
  return getEncodingCached(tokenizer).encode(text).length
}

export const tokenizerForModel = (model: LlmModel): TokenizerStrategy =>
  model.tokenizer ?? defaultTokenizerByOwner(model.owned_by)

export const countMessageTokens = (model: LlmModel, message: dto.Message) => {
  const tokenizer = tokenizerForModel(model)
  if (message.role === 'user') {
    return countTextWithTokenizer(tokenizer, message.content)
  } else if (message.role === 'assistant') {
    return message.parts
      .map((p) => {
        if (p.type === 'text') return countTextWithTokenizer(tokenizer, p.text)
        return 0
      })
      .reduce((a, b) => a + b, 0)
  }
  return 0
}

export const countTextForModel = (model: LlmModel, text: string) => {
  return countTextWithTokenizer(tokenizerForModel(model), text)
}

export const buildKnowledgePrompt = (knowledge: dto.AssistantFile[]) => {
  if (knowledge.length === 0) return ''
  return `
      More files are available as assistant knowledge.
      These files can be retrieved or processed by function calls referring to their id.
      Here is the assistant knowledge:
      ${JSON.stringify(knowledge)}
      When the user requests to gather information from unspecified files, he's referring to files attached in the same message, so **do not mention / use the knowledge if it's not useful to answer the user question**.
      `
}

export const countAssistantBaseTokens = (
  model: LlmModel,
  systemPrompt: string,
  knowledge: dto.AssistantFile[]
) => {
  return countTextForModel(model, `${systemPrompt}${buildKnowledgePrompt(knowledge)}`)
}
