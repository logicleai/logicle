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
  private selectedChoice: ImplementationChoice | null = null
  private selectedFunctions: ToolFunctions = {}
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

  providerOptions(model: LlmModel): SharedV2ProviderOptions {
    this.selectedChoice = null
    for (const choice of this.choices) {
      if (
        choice.implementation.isModelSupported &&
        !choice.implementation.isModelSupported?.(model)
      )
        continue
      const restrictions = choice.restrictions
      if (restrictions) {
        const models = restrictions.models
        if (models) {
          if (!models.includes(model.model)) {
            continue
          }
        }
      }
      this.selectedChoice = choice
      return choice.implementation.providerOptions?.(model) ?? {}
    }
    return {}
  }

  async functions(model: LlmModel, context: ToolFunctionContext): Promise<ToolFunctions> {
    this.selectedChoice = null
    this.selectedFunctions = {}
    for (const choice of this.choices) {
      if (
        choice.implementation.isModelSupported &&
        !choice.implementation.isModelSupported?.(model)
      )
        continue
      const restrictions = choice.restrictions
      if (restrictions) {
        const models = restrictions.models
        if (models) {
          if (!models.includes(model.model)) {
            continue
          }
        }
      }
      this.selectedChoice = choice
      this.selectedFunctions = await choice.implementation.functions(model, context)
      return this.selectedFunctions
    }
    return {}
  }

  resolveForToolSet(allFunctions: ToolFunctions, model: LlmModel) {
    if (!this.selectedChoice) {
      return { functions: this.selectedFunctions }
    }

    const selected = this.selectedChoice.implementation
    if (selected.resolveForToolSet) {
      return selected.resolveForToolSet(allFunctions, model)
    }
    return { functions: this.selectedFunctions }
  }
}
