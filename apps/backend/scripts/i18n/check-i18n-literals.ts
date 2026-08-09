import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { API } from 'typescript/unstable/sync'
import * as ts from 'typescript/unstable/ast'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')
const tsApi = new API()
const tsSnapshot = tsApi.updateSnapshot({
  openProjects: [path.resolve(projectRoot, '../../tsconfig.json')],
})

const ignoredDirs = new Set([
  'node_modules',
  '.next',
  'dist',
  'dist-server',
  'coverage',
  'locales',
  'styleguide',
])

const sourceExts = new Set(['.ts', '.tsx', '.js', '.jsx'])

const localizedAttributeNames = new Set([
  'title',
  'placeholder',
  'alt',
  'label',
  'aria-label',
  'ariaLabel',
  'aria-placeholder',
  'ariaPlaceholder',
])

type Issue = {
  filePath: string
  line: number
  column: number
  message: string
  text: string
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

function hasIgnoreComment(sourceText: string, sourceFile: ts.SourceFile, node: ts.Node): boolean {
  const pos = node.getStart(sourceFile)
  const { line } = sourceFile.getLineAndCharacterOfPosition(pos)
  const lines = sourceText.split(/\r?\n/)
  const current = lines[line] ?? ''
  const previous = lines[line - 1] ?? ''
  if (current.includes('i18n-ignore') || previous.includes('i18n-ignore')) return true

  const ranges = ts.getLeadingCommentRanges(sourceText, node.getFullStart()) ?? []
  return ranges.some((range) => sourceText.slice(range.pos, range.end).includes('i18n-ignore'))
}

function isMeaningfulText(text: string): boolean {
  const trimmed = text.replace(/\s+/g, ' ').trim()
  if (trimmed.length === 0) return false
  if (/^&[a-zA-Z]+;$/.test(trimmed)) return false
  return /[A-Za-z0-9]/.test(trimmed)
}

function collectIssues(filePath: string): Issue[] {
  const issues: Issue[] = []
  const sourceText = fs.readFileSync(filePath, 'utf-8')
  const sourceFile = tsSnapshot.getDefaultProjectForFile(filePath)?.program.getSourceFile(filePath)
  if (!sourceFile) return issues
  const parsedSourceFile = sourceFile

  function addIssue(node: ts.Node, message: string, text: string) {
    if (hasIgnoreComment(sourceText, parsedSourceFile, node)) return
    const pos = node.getStart(parsedSourceFile)
    const { line, character } = parsedSourceFile.getLineAndCharacterOfPosition(pos)
    issues.push({
      filePath,
      line: line + 1,
      column: character + 1,
      message,
      text,
    })
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      const text = node.getText(parsedSourceFile)
      if (isMeaningfulText(text)) {
        addIssue(node, 'JSX text literal should be localized', text.trim())
      }
    }

    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    ) {
      if (
        (ts.isStringLiteral(node.expression) ||
          ts.isNoSubstitutionTemplateLiteral(node.expression)) &&
        isMeaningfulText(node.expression.text)
      ) {
        addIssue(node, 'JSX string literal should be localized', node.expression.text)
      }
    }

    if (ts.isJsxAttribute(node)) {
      const name = node.name.getText(parsedSourceFile)
      if (!localizedAttributeNames.has(name)) {
        node.forEachChild(visit)
        return
      }
      const initializer = node.initializer
      if (!initializer) return
      if (ts.isStringLiteral(initializer) || ts.isNoSubstitutionTemplateLiteral(initializer)) {
        if (isMeaningfulText(initializer.text)) {
          addIssue(node, `JSX attribute '${name}' should be localized`, initializer.text)
        }
      } else if (ts.isJsxExpression(initializer) && initializer.expression) {
        const expr = initializer.expression
        if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
          if (isMeaningfulText(expr.text)) {
            addIssue(node, `JSX attribute '${name}' should be localized`, expr.text)
          }
        }
      }
    }

    node.forEachChild(visit)
  }

  visit(sourceFile)
  return issues
}

function main() {
  const issues: Issue[] = []
  walk(projectRoot, (filePath) => {
    const ext = path.extname(filePath)
    if (!sourceExts.has(ext)) return
    if (filePath.includes(`${path.sep}locales${path.sep}`)) return
    issues.push(...collectIssues(filePath))
  })

  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(
        `${issue.filePath}:${issue.line}:${issue.column} ${issue.message} (${issue.text})`
      )
    }
    process.exit(1)
  }

  console.log('i18n literal check passed')
}

main()
