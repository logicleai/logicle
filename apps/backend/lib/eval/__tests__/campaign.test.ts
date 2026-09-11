import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { initializeCampaign, registerBundle } from '@/backend/lib/eval/campaign'

describe('evaluation campaign directory', () => {
  it('initializes a documented private layout and rejects reinitialization', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'logicle-campaign-'))
    const manifest = await initializeCampaign(dir, 'compression smoke')
    expect(manifest.frozenProtocol.model).toBeNull()
    expect(
      (await readFile(path.join(dir, 'candidate-register.csv'), 'utf8')).split('\n')[0]
    ).toContain('caseId')
    await expect(initializeCampaign(dir, 'again')).rejects.toThrow('not empty')
  })

  it('registers a bundle by metadata without copying it and rejects duplicates', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'logicle-campaign-'))
    await initializeCampaign(dir, 'test')
    const bundle = path.join(dir, 'input.sqlite')
    const BetterSqlite = (await import('better-sqlite3')).default
    const sqlite = new BetterSqlite(bundle)
    sqlite.exec('CREATE TABLE events (id INTEGER PRIMARY KEY, label TEXT NOT NULL)')
    sqlite.prepare('INSERT INTO events (label) VALUES (?)').run('first')
    sqlite.prepare('INSERT INTO events (label) VALUES (?)').run('second')
    sqlite.prepare('INSERT INTO events (label) VALUES (?)').run('third')
    sqlite.close()
    const record = await registerBundle(dir, 'case-a', bundle, 'short')
    expect(record.bundlePath).toBe('input.sqlite')
    expect(record.sqliteTables).toEqual({ events: 3 })

    const csv = (await readFile(path.join(dir, 'candidate-register.csv'), 'utf8'))
      .trimEnd()
      .split('\n')
    const header = csv[0].split(',')
    const row = csv[1].split(',')
    expect(header).toHaveLength(14)
    expect(row).toHaveLength(header.length)
    expect(row[0]).toBe('case-a')
    expect(row[2]).toBe('short')
    expect(row[6]).toContain('""events"":3')

    await expect(registerBundle(dir, 'case-a', bundle, 'short')).rejects.toThrow(
      'already registered'
    )
    await expect(registerBundle(dir, 'case-b', bundle, 'short')).rejects.toThrow(
      'hash already registered'
    )
  })
})
