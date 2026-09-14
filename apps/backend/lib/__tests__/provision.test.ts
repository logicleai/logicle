import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const provisionConfig = vi.hoisted(() => ({ path: '' }))

process.env.DATABASE_URL = 'file:///tmp/logicle-provision-test.sqlite'

vi.mock('@/lib/env', () => ({
  default: {
    provision: {
      get config() {
        return provisionConfig.path
      },
    },
  },
}))

vi.mock('@/db/database', () => ({ db: {} }))
vi.mock('@/models/tool', () => ({ createToolWithId: vi.fn(), getTool: vi.fn(), updateTool: vi.fn() }))
vi.mock('@/models/backend', () => ({
  createBackendWithId: vi.fn(),
  getBackend: vi.fn(),
  updateBackend: vi.fn(),
}))
vi.mock('@/models/apikey', () => ({
  createApiKeyWithId: vi.fn(),
  getApiKey: vi.fn(),
  updateApiKey: vi.fn(),
}))
vi.mock('@/models/user', () => ({
  createUserRawWithId: vi.fn(),
  getUserById: vi.fn(),
  updateUser: vi.fn(),
}))
vi.mock('@/models/assistant', () => ({
  createAssistantWithId: vi.fn(),
  getAssistant: vi.fn(),
  updateAssistantVersion: vi.fn(),
}))
vi.mock('@/backend/lib/tools/configSchema', () => ({ toolConfigSchema: vi.fn() }))

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('provision', () => {
  it('ignores Kubernetes ConfigMap implementation directories', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'logicle-provision-'))
    temporaryDirectories.push(directory)
    const revisionDirectory = path.join(directory, '..2026_09_14_13_32_09.3374330128')
    fs.mkdirSync(revisionDirectory)
    fs.writeFileSync(path.join(revisionDirectory, '00-empty.yaml'), '{}')
    fs.symlinkSync(revisionDirectory, path.join(directory, '..data'))
    fs.symlinkSync(path.join('..data', '00-empty.yaml'), path.join(directory, '00-empty.yaml'))
    provisionConfig.path = directory

    const { provision } = await import('@/backend/lib/provision')

    await expect(provision()).resolves.toBeUndefined()
  })
})
