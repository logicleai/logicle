import * as dto from '@/types/dto'

export interface Protected {
  prefix: string
  hidden: number
  suffix: string
}

export type ProtectedBackend = Omit<dto.Backend, 'apiKey'> & { apiKey: Protected | string }

export function protect(str: string) {
  const len = str.length
  const clearText = Math.min(12, Math.max(0, (len >> 1) - 4))
  const prefixLen = clearText >> 1
  const suffixLen = clearText - prefixLen
  const prefix = str.substring(0, prefixLen)
  const suffix = str.substring(len - suffixLen)
  return {
    prefix,
    hidden: len - clearText,
    suffix,
  }
}

export function masked(protect: string | Protected, mask?: string, unmaskLen?: number) {
  if (typeof protect === 'string') {
    return protect
  }
  return protect.prefix + (mask ?? '.').repeat(unmaskLen ?? protect.hidden) + protect.suffix
}

export function protectApiKey(backend: dto.Backend): ProtectedBackend {
  return {
    ...backend,
    apiKey: backend.apiKey == undefined ? undefined : masked(protect(backend.apiKey), '.', 3),
  } as unknown as ProtectedBackend
}
