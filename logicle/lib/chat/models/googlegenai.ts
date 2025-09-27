import { LlmModel } from '.'
import { vertexModels } from './vertex'

export const googlegenaiModels: LlmModel[] = vertexModels.map((m) => {
  return {
    ...m,
    provider: 'googlegenai',
  }
})
