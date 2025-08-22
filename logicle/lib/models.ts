import * as fs from 'node:fs'
import * as path from 'node:path'
import { stockModels, LlmModel } from './chat/models'
import { logger } from './logging'

const loadModels = async (dir: string) => {
  const children = fs.readdirSync(dir).sort()
  const readModels = async (name: string) => {
    const childPath = path.resolve(dir, name)
    const content = await fs.promises.readFile(childPath, 'utf-8')
    try {
      return (await JSON.parse(content)) as LlmModel[]
    } catch (e) {
      logger.error(`Invalid models file ${childPath}`, e)
    }
    return []
  }
  const fragments = await Promise.all(children.map((child) => readModels(child)))
  return fragments.flat()
}

export const llmModels = process.env.PROVISION_MODELS_PATH
  ? await loadModels(process.env.PROVISION_MODELS_PATH)
  : stockModels
