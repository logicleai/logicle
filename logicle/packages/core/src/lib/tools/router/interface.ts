import * as z from 'zod'

export const RestrictionsSchema = z.object({
  models: z.array(z.string()).optional(),
})

export const RouterChoiceSchema = z.object({
  type: z.string(),
  configuration: z.record(z.string(), z.any()),
  restrictions: RestrictionsSchema.optional(),
})

export const RouterSchema = z.object({
  choices: z.array(RouterChoiceSchema),
})

export type Restrictions = z.infer<typeof RestrictionsSchema>

export type RouterParams = z.infer<typeof RouterSchema>

export class RouterInterface {
  static toolName: string = 'router'
}
