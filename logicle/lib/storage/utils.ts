import { Readable } from 'stream'

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
