import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import path from 'node:path'

// Standalone counterpart to apps/backend/server.ts's embedded dev server —
// used by `pnpm run dev:frontend` (the "Dev: Split" launch config, alongside
// `dev:backend` and `dev:proxy`), where the frontend runs as its own process
// instead of inside the unified server. Without this, `vite`'s own CLI
// serves the raw index.html with no auth gate and no env/brand bootstrap
// injection — see serveViteDevRequest's comment in staticFrontendVite.ts for
// why both processes need to share that logic rather than one silently
// going without it.
const dir = path.dirname(new URL(import.meta.url).pathname)

const mode = process.env.NODE_ENV ?? 'development'
for (const file of [`.env.${mode}.local`, '.env.local', `.env.${mode}`, '.env']) {
  const filePath = path.resolve(process.cwd(), file)
  if (existsSync(filePath)) process.loadEnvFile(filePath)
}

const { serveViteDevRequest } = await import('@/lib/staticFrontendVite')

const port = process.env.PORT || 3002

const viteDevServer = await (
  await import('vite')
).createServer({
  root: dir,
  server: { middlewareMode: true, port: Number(port) },
  appType: 'custom',
})

const server = createServer((req, res) => {
  serveViteDevRequest(req, res, viteDevServer, dir).catch((err) => {
    console.error('Unhandled HTTP request error:', err)
    if (!res.headersSent) res.writeHead(500)
    res.end()
  })
})

server.listen(port, () => {
  console.log(`> Frontend ready on http://localhost:${port}`)
})
