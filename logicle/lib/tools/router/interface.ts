import * as z from 'zod'

export interface Restrictions {
  models?: string[]
}

interface Choice {
  type: string
  configuration: Record<string, any>
  restrictions?: Restrictions
}
export interface RouterParams {
  choices: Choice[]
}

export const RouterSchema = z.object({ choices: z.any() })

export class RouterInterface {
  static toolName: string = 'router'
}
