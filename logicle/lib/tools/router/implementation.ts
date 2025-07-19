import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { Restrictions, RouterInterface, RouterParams } from './interface'
import { buildToolImplementationFromDbInfo } from '../enumerate'
import { SharedV2ProviderOptions } from '@ai-sdk/provider'

interface ImplementationChoice {
  implementation: ToolImplementation
  restrictions?: Restrictions
}

export class Router extends RouterInterface implements ToolImplementation {
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
    private params: RouterParams,
    private choices: ImplementationChoice[]
  ) {
    super()
  }

  static builder: ToolBuilder = async (
    toolParams: ToolParams,
    params_: Record<string, unknown>,
    model: string
  ) => {
    const params = params_ as unknown as RouterParams
    const choices: ImplementationChoice[] = []
    for (const choice of params.choices) {
      const implementation = await buildToolImplementationFromDbInfo(
        {
          id: '',
          type: choice.type,
          name: '',
          description: '',
          promptFragment: '',
          provisioned: toolParams.provisioned ? 1 : 0,
          capability: 0,
          createdAt: '',
          updatedAt: '',
          configuration: choice.configuration,
          tags: [],
          icon: null,
          sharing: {
            type: 'public',
          },
        },
        model
      )
      if (implementation) {
        choices.push({
          implementation,
          restrictions: choice.restrictions,
        })
      }
    }
    return new Router(toolParams, params, choices)
  }

  providerOptions(model: string): SharedV2ProviderOptions {
    for (const choice of this.choices) {
      const restrictions = choice.restrictions
      if (restrictions) {
        const models = restrictions.models
        if (models) {
          if (!models.includes(model)) {
            continue
          }
        }
      }
      return choice.implementation.providerOptions?.(model) ?? {}
    }
    return {}
  }

  functions(model: string): ToolFunctions {
    for (const choice of this.choices) {
      const restrictions = choice.restrictions
      if (restrictions) {
        const models = restrictions.models
        if (models) {
          if (!models.includes(model)) {
            continue
          }
        }
      }
      return choice.implementation.functions(model)
    }
    return {}
  }
}
