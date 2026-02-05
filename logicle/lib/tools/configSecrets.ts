import * as z from 'zod'
import { expandEnv, resolveToolSecretReference } from 'templates'
import { ToolParams } from '@/lib/chat/tools'

type SecretField = {
  key: string
  path: string[]
}

const isSecretSchema = (schema: z.ZodTypeAny): boolean => schema.description === 'secret'

const unwrapSchema = (schema: z.ZodTypeAny): z.ZodTypeAny => {
  let current: z.ZodTypeAny = schema
  // Use public v4 APIs (unwrap/in/out) instead of _def.typeName.
  while (true) {
    if (
      current instanceof z.ZodOptional ||
      current instanceof z.ZodExactOptional ||
      current instanceof z.ZodNullable ||
      current instanceof z.ZodDefault ||
      current instanceof z.ZodPrefault ||
      current instanceof z.ZodCatch ||
      current instanceof z.ZodNonOptional ||
      current instanceof z.ZodSuccess ||
      current instanceof z.ZodReadonly ||
      current instanceof z.ZodLazy ||
      current instanceof z.ZodPromise
    ) {
      current = current.unwrap() as z.ZodTypeAny
      continue
    }
    if (current instanceof z.ZodPipe) {
      current = current.out as z.ZodTypeAny
      continue
    }
    return current
  }
}

const collectSecretFields = (schema: z.ZodTypeAny, path: string[] = []): SecretField[] => {
  const unwrapped = unwrapSchema(schema)
  if (isSecretSchema(schema) || isSecretSchema(unwrapped)) {
    const key = path[path.length - 1]
    if (key) return [{ key, path }]
  }

  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape
    return Object.keys(shape).flatMap((field) =>
      collectSecretFields(shape[field], [...path, field])
    )
  }
  if (unwrapped instanceof z.ZodDiscriminatedUnion || unwrapped instanceof z.ZodUnion) {
    return unwrapped.options.flatMap((opt) => collectSecretFields(opt as z.ZodTypeAny, path))
  }
  if (unwrapped instanceof z.ZodArray) {
    return collectSecretFields(unwrapped.element as z.ZodTypeAny, path)
  }
  if (unwrapped instanceof z.ZodRecord) {
    return collectSecretFields(unwrapped.valueType as z.ZodTypeAny, path)
  }
  return []
}

const getValueAtPath = (obj: any, path: string[]) =>
  path.reduce((acc, key) => (acc && typeof acc === 'object' ? acc[key] : undefined), obj)

const setValueAtPath = (obj: any, path: string[], value: any) => {
  let cursor = obj
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (!cursor[key] || typeof cursor[key] !== 'object') cursor[key] = {}
    cursor = cursor[key]
  }
  cursor[path[path.length - 1]] = value
}

const isSecretRef = (val: string) => /^\$\{secret[.:][a-zA-Z0-9_-]+\}$/.test(val)
const isRef = (val: string) => /^\$\{[^}]+\}$/.test(val)

export const extractSecretsFromConfig = (schema: z.ZodTypeAny, config: Record<string, any>) => {
  const secretFields = collectSecretFields(schema)
  const next = JSON.parse(JSON.stringify(config)) as Record<string, any>
  const secrets: Array<{ key: string; value: string }> = []

  for (const field of secretFields) {
    const current = getValueAtPath(next, field.path)
    if (typeof current !== 'string') continue
    if (current.length === 0) continue
    if (isSecretRef(current)) continue
    secrets.push({ key: field.key, value: current })
    setValueAtPath(next, field.path, `\${secret.${field.key}}`)
  }
  return { sanitizedConfig: next, secrets }
}

export const maskSecretsInConfig = (schema: z.ZodTypeAny, config: Record<string, any>) => {
  const secretFields = collectSecretFields(schema)
  const next = JSON.parse(JSON.stringify(config)) as Record<string, any>
  for (const field of secretFields) {
    const current = getValueAtPath(next, field.path)
    if (current == null) continue
    if (typeof current === 'string' && isRef(current)) continue
    setValueAtPath(next, field.path, typeof current === 'string' ? '*'.repeat(8) : '[REDACTED]')
  }
  return next
}

export const expandToolParameter = async (
  toolParams: ToolParams,
  value: string
): Promise<string> => {
  if (!value) return value
  return toolParams.provisioned
    ? expandEnv(value)
    : await resolveToolSecretReference(toolParams.id, value)
}
