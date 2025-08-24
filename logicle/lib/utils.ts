import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const groupBy = <T>(data: T[], predicate: (t: T) => string) => {
  const map = new Map<string, T[]>()
  for (const entry of data) {
    const key = predicate(entry)
    const collection = map.get(key)
    if (!collection) {
      map.set(key, [entry])
    } else {
      collection.push(entry)
    }
  }
  return map
}
