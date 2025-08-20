import { ToolBuilder, ToolFunctions, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { Restrictions, RouterInterface, RouterParams } from './interface'
import { buildTool } from '../enumerate'
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
      const implementation = await buildTool(
        {
          type: choice.type,
          promptFragment: '',
          provisioned: toolParams.provisioned,
          configuration: choice.configuration,
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

  async functions(model: string): Promise<ToolFunctions> {
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
