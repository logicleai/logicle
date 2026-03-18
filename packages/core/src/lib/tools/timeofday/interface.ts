import * as z from 'zod'

export const TimeOfDaySchema = z.object({}).strict()

export type TimeOfDayParams = z.infer<typeof TimeOfDaySchema>

export class TimeOfDayInterface {
  static toolName: string = 'timeofday'
}
