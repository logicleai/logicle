import { ToolBuilder, ToolFunction, ToolImplementation } from '@/lib/chat/tools'
import { TimeOfDayInterface } from './interface'

export class TimeOfDay extends TimeOfDayInterface implements ToolImplementation {
  static builder: ToolBuilder = () => new TimeOfDay()
  functions: Record<string, ToolFunction> = {
    timeOfDay: {
      description: 'Retrieve the current time',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city and state, e.g. San Francisco, CA',
          },
        },
        required: ['location'],
      },
      requireConfirm: false,
      invoke: async () => {
        /*
          uiLink.newMessage()
          for (let i = 0; i < 10; i++) {
            await new Promise((f) => setTimeout(f, 200))
            uiLink.appendText(`${i}...`)
          }
        */
        return new Date().toISOString()
      },
    },
  }
}
