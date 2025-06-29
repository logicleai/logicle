import {
  LanguageModelV2Prompt,
  SharedV2ProviderMetadata,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider'
import { convertToBase64 } from '@ai-sdk/provider-utils'
import { LitellmChatPrompt } from './litellm-api-types'

function getOpenAIMetadata(message: { providerOptions?: SharedV2ProviderMetadata }) {
  return message?.providerOptions?.litellm ?? {}
}

export function convertToLitellmChatMessages(prompt: LanguageModelV2Prompt): LitellmChatPrompt {
  const messages: LitellmChatPrompt = []
  for (const { role, content, ...message } of prompt) {
    const metadata = getOpenAIMetadata({ ...message })
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content, ...metadata })
        break
      }

      case 'user': {
        if (content.length === 1 && content[0].type === 'text') {
          messages.push({
            role: 'user',
            content: content[0].text,
            ...getOpenAIMetadata(content[0]),
          })
          break
        }

        messages.push({
          role: 'user',
          content: content.map((part) => {
            const partMetadata = getOpenAIMetadata(part)
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text, ...partMetadata }
              }
              case 'file': {
                if (part.mediaType.startsWith('image/')) {
                  const mediaType = part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType
                  return {
                    type: 'image_url',
                    image_url: {
                      url:
                        part.data instanceof URL
                          ? part.data.toString()
                          : `data:${mediaType ?? 'image/jpeg'};base64,${convertToBase64(
                              part.data
                            )}`,
                    },
                    ...partMetadata,
                  }
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'File content parts in user messages',
                  })
                }
              }
            }
          }),
          ...metadata,
        })

        break
      }

      case 'assistant': {
        let text = ''
        const toolCalls: Array<{
          id: string
          type: 'function'
          function: { name: string; arguments: string }
        }> = []

        for (const part of content) {
          const partMetadata = getOpenAIMetadata(part)
          switch (part.type) {
            case 'text': {
              text += part.text
              break
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.input),
                },
                ...partMetadata,
              })
              break
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          ...metadata,
        })

        break
      }

      case 'tool': {
        for (const toolResponse of content) {
          const toolResponseMetadata = getOpenAIMetadata(toolResponse)
          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content: JSON.stringify(toolResponse.output),
            ...toolResponseMetadata,
          })
        }
        break
      }

      default: {
        const _exhaustiveCheck: never = role
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`)
      }
    }
  }

  return messages
}
