import { createServer, request as httpRequest } from 'node:http'
import net from 'node:net'
import { parse } from 'node:url'

const PROXY_PORT = process.env.PORT || 3000
const BACKEND = new URL(process.env.BACKEND_URL || 'http://localhost:3001')
const FRONTEND = new URL(process.env.FRONTEND_URL || 'http://localhost:3002')

function target(pathname: string | null) {
  return pathname?.startsWith('/api/') ? BACKEND : FRONTEND
}

const server = createServer((req, res) => {
  const { pathname } = parse(req.url || '/')
  const { hostname, port } = target(pathname)

  const proxyReq = httpRequest(
    { hostname, port, path: req.url, method: req.method, headers: req.headers },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode!, proxyRes.headers)
      proxyRes.pipe(res)
      proxyRes.on('error', () => res.destroy())
    }
  )
  proxyReq.on('error', (err) => {
    console.error(`[proxy] ${req.method} ${req.url} → ${hostname}:${port} failed: ${err.message}`)
    if (!res.headersSent) res.writeHead(502).end()
    else res.destroy()
  })
  req.pipe(proxyReq)
  req.on('error', () => proxyReq.destroy())
})

server.on('upgrade', (req, socket, head) => {
  const { pathname } = parse(req.url || '/')
  const { hostname, port } = target(pathname)

  const upstream = net.connect(Number(port), hostname)
  upstream.on('connect', () => {
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`
    for (const [k, v] of Object.entries(req.headers)) raw += `${k}: ${v}\r\n`
    raw += '\r\n'
    upstream.write(raw)
    if (head.length > 0) upstream.write(head)
    socket.pipe(upstream)
    upstream.pipe(socket)
  })
  upstream.on('error', (err) => {
    console.error(`[proxy] WS ${req.url} → ${hostname}:${port} failed: ${err.message}`)
    socket.destroy()
  })
  socket.on('error', () => upstream.destroy())
})

server.listen(PROXY_PORT, () => {
  console.log(`> Proxy on http://localhost:${PROXY_PORT}`)
  console.log(`>   /api/* → ${BACKEND}`)
  console.log(`>   /*     → ${FRONTEND}`)
})
