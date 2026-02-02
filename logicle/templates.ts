import { getToolSecretValue } from './models/toolSecrets'

export function expandEnv(template: string) {
  return template.replace(/\${(\w*)}/g, (_match, key) => {
    return process.env[key] || ''
  })
}

export const resolveToolSecretReference = async (
  toolId: string,
  value: string
): Promise<string> => {
  const match = value.match(/^\$\{secret\.([a-zA-Z0-9_-]+)\}$/)
  if (!match) return value
  const resolved = await getToolSecretValue(toolId, match[1])
  return resolved.status === 'ok' ? resolved.value : value
}
