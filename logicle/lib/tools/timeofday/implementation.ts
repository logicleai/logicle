import { ToolBuilder, ToolFunction, ToolImplementation } from '@/lib/chat/tools'
import { TimeOfDayInterface } from './interface'

export class TimeOfDay extends TimeOfDayInterface implements ToolImplementation {
  static builder: ToolBuilder = () => new TimeOfDay()
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
