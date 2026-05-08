import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolParams,
} from '@/lib/chat/tools'
import { Restrictions, RouterInterface, RouterParams } from '@/lib/tools/schemas'
import { buildTool } from '../enumerate'
import { SharedV2ProviderOptions } from '@ai-sdk/provider'
import { LlmModel } from '@/lib/chat/models'

interface ImplementationChoice {
  implementation: ToolImplementation
  restrictions?: Restrictions
}

export class Router extends RouterInterface implements ToolImplementation {
  supportedMedia = []
  constructor(
    public toolParams: ToolParams,
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
          name: '',
          id: '',
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
    return new Router(toolParams, choices)
  }

  private matchingChoice(model: LlmModel): ImplementationChoice | null {
    for (const choice of this.choices) {
      if (
        choice.implementation.isModelSupported &&
        !choice.implementation.isModelSupported(model)
      )
        continue
      const models = choice.restrictions?.models
      if (models && !models.includes(model.model)) continue
      return choice
    }
    return null
  }

  providerOptions(model: LlmModel): SharedV2ProviderOptions {
    return this.matchingChoice(model)?.implementation.providerOptions?.(model) ?? {}
  }

  async functions(model: LlmModel, context: ToolFunctionContext): Promise<ToolFunctions> {
    const choice = this.matchingChoice(model)
    return choice ? choice.implementation.functions(model, context) : {}
  }
}
