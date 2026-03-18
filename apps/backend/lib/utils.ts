export function ensureABView(u8: Uint8Array): Uint8Array<ArrayBuffer> {
  return u8.buffer instanceof SharedArrayBuffer
    ? new Uint8Array(u8)
    : (u8 as Uint8Array<ArrayBuffer>)
}
