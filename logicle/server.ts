import express from 'express'
import next from 'next'

const app = next({ dev: false, turbopack: false })
const handle = app.getRequestHandler()
await app.prepare()
const server = express()
// Default catch-all handler
server.get('/express', (req, res) => {
  res.send('Hello, World!')
  return
})
server.all('*', (req, res) => {
  return handle(req, res)
})
server.listen(3000, () => {
  console.log('> Ready on http://localhost:3000')
})
