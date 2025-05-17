import { ToolBuilder, ToolFunction, ToolImplementation, ToolParams } from '@/lib/chat/tools'
import { TimeOfDayInterface } from './interface'

export class TimeOfDay extends TimeOfDayInterface implements ToolImplementation {
  static builder: ToolBuilder = (config: ToolParams) => new TimeOfDay(config)
  constructor(public toolParams: ToolParams) {
    super()
  }
  supportedMedia = []
  functions: Record<string, ToolFunction> = {
    timeOfDay: {
      description: 'Retrieve the current time',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      requireConfirm: false,
      invoke: async () => {
        return new Date().toISOString()
      },
    },
  }
}
