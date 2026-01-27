import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const localesRoot = path.join(projectRoot, 'locales')

const ignoredDirs = new Set([
  'node_modules',
  '.next',
  'dist',
  'dist-server',
  'coverage',
  'locales',
])

const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx'])
const kebabCaseRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const failUnused = process.argv.includes('--fail-unused')
const skipKebab = process.argv.includes('--skip-kebab') || process.argv.includes('--no-kebab')

type LocaleMap = Map<string, Set<string>>

function isKebabCase(key: string): boolean {
  return kebabCaseRegex.test(key)
}

function walk(dir: string, onFile: (filePath: string) => void) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue
      walk(fullPath, onFile)
      continue
    }
    onFile(fullPath)
  }
}

function findLocaleFiles(): string[] {
  if (!fs.existsSync(localesRoot)) return []
  const files: string[] = []
  walk(localesRoot, (filePath) => {
    if (path.basename(filePath) === 'logicle.json') {
      files.push(filePath)
    }
  })
  return files
}

function flattenKeys(obj: unknown, prefix = ''): Set<string> {
  const keys = new Set<string>()
  if (!obj || typeof obj !== 'object') return keys
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const next = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const child of flattenKeys(value, next)) {
        keys.add(child)
      }
    } else {
      keys.add(next)
    }
  }
  return keys
}

function loadLocales(): LocaleMap {
  const localeFiles = findLocaleFiles()
  const locales: LocaleMap = new Map()
  for (const filePath of localeFiles) {
    const locale = path.basename(path.dirname(filePath))
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    locales.set(locale, flattenKeys(parsed))
  }
  return locales
}

function collectKeysFromSource(filePath: string): Set<string> {
  const text = fs.readFileSync(filePath, 'utf-8')
  const ext = path.extname(filePath)
  const kind =
    ext === '.tsx' || ext === '.jsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, kind)
  const keys = new Set<string>()

  function addKeyFromArg(arg?: ts.Expression) {
    if (!arg) return
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
      if (arg.text.trim().length === 0) return
      keys.add(arg.text)
    }
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const callee = node.expression
      let isTFunction = false
      if (ts.isIdentifier(callee) && callee.text === 't') {
        isTFunction = true
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === 't' &&
        ts.isIdentifier(callee.expression) &&
        (callee.expression.text === 'i18n' || callee.expression.text === 'i18next')
      ) {
        isTFunction = true
      }
      if (isTFunction) {
        addKeyFromArg(node.arguments[0])
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return keys
}

function collectCodeKeys(): Set<string> {
  const keys = new Set<string>()
  walk(projectRoot, (filePath) => {
    const ext = path.extname(filePath)
    if (!sourceExts.has(ext)) return
    if (filePath.includes(`${path.sep}locales${path.sep}`)) return
    const fileKeys = collectKeysFromSource(filePath)
    for (const key of fileKeys) {
      keys.add(key)
    }
  })
  return keys
}

function main() {
  const locales = loadLocales()
  if (locales.size === 0) {
    console.error('No locale files found under locales/**/logicle.json')
    process.exit(1)
  }

  const codeKeys = collectCodeKeys()
  const allLocaleKeys = new Set<string>()
  for (const keys of locales.values()) {
    for (const key of keys) allLocaleKeys.add(key)
  }

  const missingInLocales = [...codeKeys].filter((key) => !allLocaleKeys.has(key))
  const unusedInCode = [...allLocaleKeys].filter((key) => !codeKeys.has(key))

  const nonConformingLocaleKeys = skipKebab
    ? []
    : [...allLocaleKeys].filter((key) => !isKebabCase(key))
  const nonConformingCodeKeys = skipKebab ? [] : [...codeKeys].filter((key) => !isKebabCase(key))

  let hasErrors = false

  if (missingInLocales.length > 0) {
    hasErrors = true
    console.error(`Missing keys in locales (${missingInLocales.length}):`)
    for (const key of missingInLocales.sort()) {
      console.error(`  - ${key}`)
    }
  }

  for (const [locale, keys] of locales.entries()) {
    const missing = [...allLocaleKeys].filter((key) => !keys.has(key))
    if (missing.length > 0) {
      hasErrors = true
      console.error(`Locale '${locale}' missing keys (${missing.length}):`)
      for (const key of missing.sort()) {
        console.error(`  - ${key}`)
      }
    }
  }

  if (unusedInCode.length > 0) {
    if (failUnused) hasErrors = true
    console.error(`Unused locale keys (${unusedInCode.length}):`)
    for (const key of unusedInCode.sort()) {
      console.error(`  - ${key}`)
    }
  }

  if (nonConformingLocaleKeys.length > 0) {
    hasErrors = true
    console.error(`Locale keys not kebab-case (${nonConformingLocaleKeys.length}):`)
    for (const key of nonConformingLocaleKeys.sort()) {
      console.error(`  - ${key}`)
    }
  }

  if (nonConformingCodeKeys.length > 0) {
    hasErrors = true
    console.error(`Code keys not kebab-case (${nonConformingCodeKeys.length}):`)
    for (const key of nonConformingCodeKeys.sort()) {
      console.error(`  - ${key}`)
    }
  }

  if (hasErrors) {
    process.exit(1)
  }

  console.log('i18n key check passed')
}

main()
