export function ensureABView(u8: Uint8Array): Uint8Array<ArrayBuffer> {
  return u8.buffer instanceof SharedArrayBuffer
    ? new Uint8Array(u8)
    : (u8 as Uint8Array<ArrayBuffer>)
}

export const slugify = (text: string) => {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
}
