export type KeysEnum<T> = { [P in keyof Required<T>]: true }

export function sanitize<T extends object>(obj: T, props: KeysEnum<T>): T {
  for (const propName of Object.keys(obj)) {
    if (!props[propName]) {
      delete obj[propName]
    }
  }
  return obj
}
