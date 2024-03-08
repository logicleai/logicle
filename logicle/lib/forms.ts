import { nanoid } from 'nanoid'

interface Part {
  name: string
  content: ReadableStream | string
  contentType?: string
  filename?: string
}

/// Create a multipart
export const multipartFormBody = (
  parts: Part[]
): { headers: Record<string, string>; stream: ReadableStream } => {
  const outputParts: (ReadableStream | Buffer)[] = []
  const boundary = '--------------------------825185448730189563318378' //nanoid().toString()
  for (const part of parts) {
    let contentDispositionLine = `Content-Disposition: form-data; name="${part.name}"`
    if (part.filename) {
      contentDispositionLine += `; filename="${part.filename}"`
    }
    contentDispositionLine += '\r\n'
    let contentTypeLine = ''
    if (part.contentType) {
      contentTypeLine = `Content-Type: ${part.contentType}\r\n`
    }
    outputParts.push(
      Buffer.from(`\r\n--${boundary}\r\n${contentDispositionLine}${contentTypeLine}\r\n`)
    )
    if (typeof part.content === 'string') {
      outputParts.push(Buffer.from(part.content))
    } else {
      outputParts.push(part.content)
    }
  }
  outputParts.push(Buffer.from(`\r\n--${boundary}--\r\n`))
  let nextPartIdx = 0
  let currentPart: ReadableStreamDefaultReader | Buffer | undefined
  const nextPart = () => {
    if (nextPartIdx >= outputParts.length) {
      currentPart = undefined
    } else {
      const part = outputParts[nextPartIdx]
      if (part instanceof Buffer) currentPart = part
      else currentPart = part.getReader()
      nextPartIdx++
    }
  }
  nextPart()
  const stream = new ReadableStream({
    pull: async (controller) => {
      while (currentPart) {
        if (currentPart instanceof Buffer) {
          console.log('' + new String(currentPart))
          controller.enqueue(currentPart)
        } else {
          const r = await currentPart.read()
          if (r.value !== undefined) {
            console.log(new String(r.value))
            controller.enqueue(r.value)
            return
          }
        }
        nextPart()
      }
      controller.close()
    },
  })
  return {
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    stream,
  }
}
