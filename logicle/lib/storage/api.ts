export interface Storage {
  writeFile(path: string, stream: ReadableStream<Uint8Array>, size?: number): Promise<void>
  writeBuffer(path: string, buffer: Uint8Array): Promise<void>
  rm(path: string): Promise<void>
  readFile(path: string): Promise<Buffer>
}

export abstract class BaseStorage implements Storage {
  abstract writeFile(path: string, stream: ReadableStream<Uint8Array>, size?: number): Promise<void>
  abstract rm(path: string): Promise<void>
  abstract readFile(path: string): Promise<Buffer>
  async writeBuffer(path: string, buffer: Uint8Array) {
    function bufferToReadableStream(buffer: Uint8Array): ReadableStream<Uint8Array> {
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(buffer) // Push the whole buffer as Uint8Array
          controller.close() // Close the stream
        },
      })
    }
    await this.writeFile(path, bufferToReadableStream(buffer), buffer.length)
  }
}
