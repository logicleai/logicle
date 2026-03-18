import { Readable } from 'node:stream'

export async function collectStreamToBuffer(
  readableStream: ReadableStream<Uint8Array>
): Promise<Buffer> {
  const chunks: Uint8Array[] = []

  const reader = readableStream.getReader()
  let done = false
  do {
    const { value, done: isDone } = await reader.read()
    done = isDone
    if (value) {
      chunks.push(Buffer.from(value))
    }
  } while (!done)

  // Combine all chunks into a single Buffer
  return Buffer.concat(chunks)
}

export function bufferToReadableStream(buffer: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(buffer) // Push the whole buffer as Uint8Array
      controller.close() // Close the stream
    },
  })
}

export function nodeStreamToReadableStream(nodeStream: Readable) {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk: Buffer) => controller.enqueue(chunk))
      nodeStream.on('end', () => controller.close())
      nodeStream.on('error', (err) => controller.error(err))
    },
    cancel() {
      nodeStream.destroy()
    },
  })
}
