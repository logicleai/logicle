import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import process from 'node:process'
import { PassThrough, type Duplex } from 'node:stream'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

type ServerParameters = {
  command: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  onFileBridge: (channel: Duplex) => void
}

const inheritedEnvironment = () => {
  const keys = process.platform === 'win32' ? ['PATH', 'TEMP', 'USERNAME', 'USERPROFILE'] : ['HOME', 'LOGNAME', 'PATH', 'SHELL', 'TERM']
  return Object.fromEntries(keys.flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key] as string]]))
}

/** MCP stdio transport with an additional, private duplex FD (3). */
export class SandboxedStdioClientTransport implements Transport {
  private child?: ChildProcessWithoutNullStreams
  private readBuffer = new ReadBuffer()
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void

  constructor(private readonly params: ServerParameters) {}

  async start() {
    if (this.child) throw new Error('Transport already started')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(this.params.command, this.params.args ?? [], {
        env: { ...inheritedEnvironment(), ...this.params.env, LOGICLE_FILE_BRIDGE_FD: '3' } as unknown as NodeJS.ProcessEnv,
        cwd: this.params.cwd,
        shell: false,
        windowsHide: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'inherit', 'pipe'],
      }) as ChildProcessWithoutNullStreams
      this.child = child
      child.once('error', (error) => { reject(error); this.onerror?.(error) })
      child.once('spawn', () => {
        const bridge = child.stdio[3]
        if (!bridge || typeof (bridge as Duplex).write !== 'function') {
          reject(new Error('MCP file bridge FD is unavailable'))
          return
        }
        this.params.onFileBridge(bridge as Duplex)
        resolve()
      })
      child.once('close', () => { this.child = undefined; this.onclose?.() })
      child.stdin.on('error', (error) => this.onerror?.(error))
      child.stdout.on('error', (error) => this.onerror?.(error))
      child.stdout.on('data', (chunk) => {
        this.readBuffer.append(chunk)
        while (true) {
          try {
            const message = this.readBuffer.readMessage()
            if (!message) break
            this.onmessage?.(message)
          } catch (error) { this.onerror?.(error as Error); break }
        }
      })
    })
  }

  async close() {
    const child = this.child
    this.child = undefined
    child?.stdin.end()
    child?.kill('SIGTERM')
    this.readBuffer.clear()
  }

  async send(message: JSONRPCMessage) {
    if (!this.child) throw new Error('Not connected')
    const data = serializeMessage(message)
    if (this.child.stdin.write(data)) return
    await new Promise<void>((resolve, reject) => {
      this.child?.stdin.once('drain', resolve)
      this.child?.stdin.once('error', reject)
    })
  }
}
