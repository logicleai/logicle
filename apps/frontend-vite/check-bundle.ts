import { readFile } from 'node:fs/promises'

const reportPath = new URL('./dist/bundle-report.json', import.meta.url)
const report = JSON.parse(await readFile(reportPath, 'utf8')) as {
  chunks: Array<{
    file: string
    bytes: number
    gzipBytes: number
    modules: Array<{ id: string; bytes: number }>
  }>
  entrypoints?: {
    chat?: { chunks: string[]; bytes: number; gzipBytes: number }
  }
}

const chat = report.entrypoints?.chat
if (!chat) {
  throw new Error('Frontend bundle report does not contain the chat entrypoint')
}

// This is the transfer budget for the JavaScript loaded by the initial chat
// route, including the base entry and its static dependencies. Feature
// chunks (syntax highlighting, Mermaid, spreadsheet export, and tokenizer)
// remain outside this budget until their feature is used.
const CHAT_INITIAL_JS_BUDGET = 1_500_000
const CHAT_INITIAL_JS_GZIP_BUDGET = 500_000

const formatBytes = (bytes: number) => `${(bytes / 1024).toFixed(1)} KiB`
const largestModules = report.chunks
  .filter((chunk) => chat.chunks.includes(chunk.file))
  .flatMap((chunk) => chunk.modules.map((module) => ({ ...module, chunk: chunk.file })))
  .sort((a, b) => b.bytes - a.bytes)
  .slice(0, 5)

console.log(
  `Initial chat JavaScript: ${formatBytes(chat.bytes)} ` + `(${formatBytes(chat.gzipBytes)} gzip)`
)
console.log('Largest initial-chat modules:')
for (const module of largestModules) {
  console.log(`  ${formatBytes(module.bytes)}\t${module.id} (${module.chunk})`)
}

if (chat.bytes > CHAT_INITIAL_JS_BUDGET || chat.gzipBytes > CHAT_INITIAL_JS_GZIP_BUDGET) {
  throw new Error(
    `Initial chat JavaScript exceeds budget: ${formatBytes(chat.bytes)} / ${formatBytes(
      chat.gzipBytes
    )} gzip`
  )
}
