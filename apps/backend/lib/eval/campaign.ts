import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createReadStream } from 'node:fs'

export const CAMPAIGN_VERSION = 1
export const CAMPAIGN_MANIFEST = 'manifest.json'
export const BUNDLE_REGISTER = 'candidate-register.csv'

export interface CampaignManifest {
  version: number
  name: string
  createdAt: string
  createdWith: { gitRevision: string | null; gitDirty: boolean | null; command: string }
  owner: string | null
  purpose: string
  scope: {
    source: string | null
    cohorts: string[] | null
    includedContent: string[] | null
    excludedContent: string[] | null
    notes: string | null
  }
  retention: {
    owner: string | null
    rawBundles: string | null
    runs: string | null
    sanitized: string | null
  }
  frozenProtocol: {
    provider: string | null
    model: string | null
    tokenizer: string | null
    preset: string | null
    retrievalMode: string | null
    keepRecentTurns: number[] | null
    triggerAtTokens: number | null
    minimumMessageSavingsTokens: number
    minimumPlanSavingsTokens: number
    knowledgeArms: string[] | null
    repeat: number | null
    materialGainThreshold: number | null
    candidateSelectionRule: string | null
  }
  sourceReviewStatus: string | null
  contentPolicy: string
}

export interface RegisteredBundle {
  caseId: string
  bundlePath: string
  cohort: string
  sha256: string
  bytes: number
  registeredAt: string
  sqliteTables: Record<string, number> | null
}

const contentPolicy =
  'Bundles and raw runs may contain production messages, attachments, filenames, tool results, and model responses. Keep this directory private and local; do not commit, upload, or share it. Put only reviewed, sanitized case metadata and aggregates in sanitized/.'

const git = (args: string[]): string | null => {
  try {
    return (
      execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() ||
      null
    )
  } catch {
    return null
  }
}

const csvCell = (value: string | number | null): string => {
  const text = value === null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const parseCsvLine = (line: string): string[] => {
  const values: string[] = []
  let value = ''
  let quoted = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"'
        i += 1
      } else quoted = !quoted
    } else if (char === ',' && !quoted) {
      values.push(value)
      value = ''
    } else value += char
  }
  values.push(value)
  return values
}

const registerHeader = [
  'caseId',
  'bundlePath',
  'cohort',
  'sha256',
  'bytes',
  'registeredAt',
  'sqliteTables',
  'reviewedSourceClaim',
  'answerAbsentFromHistory',
  'compressionTriggered',
  'historyReductionTokens',
  'eligibility',
  'outcome',
  'notes',
]

export const initializeCampaign = async (
  directory: string,
  name: string
): Promise<CampaignManifest> => {
  if (!name.trim()) throw new Error('Campaign name must not be empty')
  const dir = path.resolve(directory)
  let existing: string[] = []
  try {
    existing = await (await import('node:fs/promises')).readdir(dir)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (existing.length > 0) throw new Error(`Campaign directory is not empty: ${dir}`)
  await mkdir(path.join(dir, 'bundles'), { recursive: true, mode: 0o700 })
  await mkdir(path.join(dir, 'runs'), { mode: 0o700 })
  await mkdir(path.join(dir, 'sanitized'), { mode: 0o700 })
  const gitStatus = git(['status', '--porcelain'])
  const manifest: CampaignManifest = {
    version: CAMPAIGN_VERSION,
    name,
    createdAt: new Date().toISOString(),
    createdWith: {
      gitRevision: git(['rev-parse', 'HEAD']),
      gitDirty: gitStatus === null ? null : gitStatus !== '',
      command: process.argv.join(' '),
    },
    owner: null,
    purpose:
      'Evaluate context compression and knowledge-box strategies on reviewed candidate bundles.',
    scope: {
      source: null,
      cohorts: null,
      includedContent: null,
      excludedContent: null,
      notes: null,
    },
    retention: { owner: null, rawBundles: null, runs: null, sanitized: null },
    frozenProtocol: {
      provider: null,
      model: null,
      tokenizer: null,
      preset: null,
      retrievalMode: null,
      keepRecentTurns: null,
      triggerAtTokens: null,
      minimumMessageSavingsTokens: 64,
      minimumPlanSavingsTokens: 384,
      knowledgeArms: null,
      repeat: null,
      materialGainThreshold: null,
      candidateSelectionRule: null,
    },
    sourceReviewStatus: null,
    contentPolicy,
  }
  await writeFile(path.join(dir, CAMPAIGN_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, {
    mode: 0o600,
  })
  await writeFile(path.join(dir, BUNDLE_REGISTER), `${registerHeader.join(',')}\n`, { mode: 0o600 })
  await writeFile(
    path.join(dir, 'README.md'),
    `# ${name}\n\nThis private directory was initialized for context-compression + knowledge-box evaluation.\n\nCreated: ${
      manifest.createdAt
    }\nRevision: ${manifest.createdWith.gitRevision ?? 'unknown'}\nCreated with: ${
      manifest.createdWith.command
    }\n\n## Contents\n\n- bundles/: source SQLite bundles with complete conversation histories and decrypted attachment/assistant-knowledge bytes\n- runs/: raw model responses, reports, inspections, and tool-call/token evidence\n- sanitized/: reviewed case ledger and aggregates safe to share\n- candidate-register.csv: checksummed bundle inventory plus source review, eligibility, and outcome columns\n- manifest.json: campaign provenance and protocol fields that must be frozen before replay\n\n## Workflow\n\n1. Fill the null owner, scope, retention, frozenProtocol, and sourceReviewStatus fields in manifest.json before selecting candidates. Record included and deliberately excluded content explicitly.\n2. Build bundles directly into bundles/ with eval-build-replay-bundle.ts --campaign-dir <this-directory> --case <opaque-id> --cohort <shape>.\n3. Complete source-review and inspect-only columns in candidate-register.csv before any paid replay.\n4. Store raw A/B/C/D runs under runs/ and only reviewed, non-sensitive aggregates under sanitized/.\n5. Delete private artifacts according to the retention fields; retain the sanitized ledger if approved.\n\n${contentPolicy}\n`,
    { mode: 0o600 }
  )
  await chmod(dir, 0o700)
  return manifest
}

const checksum = async (file: string): Promise<{ sha256: string; bytes: number }> =>
  new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    let bytes = 0
    const stream = createReadStream(file)
    stream.on('data', (chunk: string | Buffer) => {
      const bytesChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      bytes += bytesChunk.length
      hash.update(bytesChunk)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve({ sha256: hash.digest('hex'), bytes }))
  })

const sqliteCounts = async (file: string): Promise<Record<string, number> | null> => {
  try {
    const BetterSqlite = (await import('better-sqlite3')).default
    const db = new BetterSqlite(file, { readonly: true })
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string }>
    const counts: Record<string, number> = {}
    for (const table of tables) {
      const identifier = `"${table.name.replaceAll('"', '""')}"`
      counts[table.name] = Number(
        (db.prepare(`SELECT COUNT(*) AS count FROM ${identifier}`).get() as { count: number }).count
      )
    }
    db.close()
    return counts
  } catch {
    return null
  }
}

export const registerBundle = async (
  directory: string,
  caseId: string,
  bundle: string,
  cohort: string
): Promise<RegisteredBundle> => {
  if (!caseId.trim() || !cohort.trim()) throw new Error('Case id and cohort must not be empty')
  const dir = path.resolve(directory)
  const manifest = JSON.parse(
    await readFile(path.join(dir, CAMPAIGN_MANIFEST), 'utf8')
  ) as CampaignManifest
  if (manifest.version !== CAMPAIGN_VERSION)
    throw new Error('Unsupported campaign manifest version')
  const bundlePathAbsolute = path.resolve(bundle)
  const info = await stat(bundlePathAbsolute)
  if (!info.isFile()) throw new Error(`Bundle is not a file: ${bundlePathAbsolute}`)
  const digest = await checksum(bundlePathAbsolute)
  const registerPath = path.join(dir, BUNDLE_REGISTER)
  const text = await readFile(registerPath, 'utf8')
  const rows = text.split(/\r?\n/).filter(Boolean).slice(1).map(parseCsvLine)
  if (rows.some((row) => row[0] === caseId))
    throw new Error(`Case id already registered: ${caseId}`)
  if (rows.some((row) => row[3] === digest.sha256))
    throw new Error(`Bundle hash already registered: ${digest.sha256}`)
  const relative = path.relative(dir, bundlePathAbsolute)
  const storedPath =
    relative && !relative.startsWith('..') && !path.isAbsolute(relative)
      ? relative
      : bundlePathAbsolute
  const result: RegisteredBundle = {
    caseId,
    bundlePath: storedPath,
    cohort,
    ...digest,
    registeredAt: new Date().toISOString(),
    sqliteTables: await sqliteCounts(bundlePathAbsolute),
  }
  await writeFile(
    registerPath,
    `${text.trimEnd()}\n${[
      result.caseId,
      result.bundlePath,
      result.cohort,
      result.sha256,
      result.bytes,
      result.registeredAt,
      result.sqliteTables ? JSON.stringify(result.sqliteTables) : '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ]
      .map(csvCell)
      .join(',')}\n`,
    { mode: 0o600 }
  )
  return result
}
