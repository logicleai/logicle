import { createServer } from 'node:http'
import next from 'next'
import { parse } from 'node:url'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const dir = path.dirname(fileURLToPath(import.meta.url))

const mode = process.env.NODE_ENV ?? 'development'
for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
  const filePath = path.resolve(process.cwd(), file)
  if (existsSync(filePath)) process.loadEnvFile(filePath)
}
const port = process.env.PORT || 3002

const app = next({ dev: true, dir })
const handle = app.getRequestHandler()
const getUpgradeHandler =
  typeof app.getUpgradeHandler === 'function' ? app.getUpgradeHandler.bind(app) : null

await app.prepare()

const server = createServer((req, res) => {
  handle(req, res, parse(req.url || '/', true))
})

if (getUpgradeHandler) {
  server.on('upgrade', getUpgradeHandler())
}

server.listen(port, () => {
  console.log(`> Frontend ready on http://localhost:${port}`)
})
