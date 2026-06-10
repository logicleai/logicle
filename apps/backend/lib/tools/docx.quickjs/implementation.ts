import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import { DocxQuickJsInterface, DocxQuickJsSchema } from '@/lib/tools/schemas'
import { LlmModel } from '@/lib/chat/models'
import * as dto from '@/types/dto'
import { materializeFile } from '@/backend/lib/files/materialize'
import { resolveFileOwner } from '@/backend/lib/tools/ownership'
import { getFileWithId } from '@/models/file'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { storage } from '@/lib/storage'
import { lookup as mimeLookup } from 'mime-types'
import JSZip from 'jszip'
import { readDocxAsMarkdown } from './renderer'

// Cache the dynamic import so the WASM module is only loaded once per process.
let quickjsModulePromise: Promise<{ newAsyncContext: () => Promise<any> }> | null = null
function getQuickJsModule() {
  if (!quickjsModulePromise) {
    quickjsModulePromise = import('quickjs-emscripten') as any
  }
  return quickjsModulePromise!
}

export class DocxQuickJsTool extends DocxQuickJsInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new DocxQuickJsTool(toolParams, DocxQuickJsSchema.parse(params))

  supportedMedia = []

  constructor(
    public toolParams: ToolParams,
    _params: Record<string, never>
  ) {
    super()
  }

  functions = async (_model: LlmModel, _context: ToolFunctionContext): Promise<ToolFunctions> =>
    this.functions_

  functions_: ToolFunctions = {
    docx_script: {
      description: `Execute JavaScript in a sandboxed QuickJS VM to create or transform Word (.docx) documents.

━━ IMPORTANT: host functions are SYNCHRONOUS — do NOT use await ━━
  (They are async on the host but appear synchronous inside QuickJS via asyncify.)

━━ Attachment access ━━

  getAttachment(fileId) → base64 string
    Read any uploaded attachment as a base64-encoded byte string.

━━ Open / edit / save existing .docx (OOXML level) ━━

A .docx file is a ZIP archive. The primary content lives in XML files inside it.
Use these functions to open it, read and modify its XML files, and repack it.

  openDocx(base64) → handle (integer)
    Open a .docx from base64 bytes. Returns an opaque integer handle.
    Multiple documents can be open simultaneously with different handles.

  listFiles(handle) → JSON string (string[])
    List all file paths inside the ZIP (e.g. ["word/document.xml", ...]).

  readXml(handle, path) → XML string
    Read a text/XML file from the open document by path.
    Common paths:
      "word/document.xml"          — the document body (paragraphs, tables, runs)
      "word/_rels/document.xml.rels" — relationship IDs → hyperlink URLs
      "word/styles.xml"            — named styles
      "word/numbering.xml"         — list numbering definitions
      "[Content_Types].xml"        — content type declarations

  writeXml(handle, path, xmlString)
    Write (replace) a text/XML file inside the open document.
    Pass the full modified XML string.

  saveDocx(handle) → base64 string
    Repack the ZIP and return the result as base64. The handle is disposed.

━━ Key OOXML structure (word/document.xml) ━━

Namespaces: w: (WordprocessingML), r: (relationships), a: (drawing), wp: (drawing position).
Always declare them on the root element — they are already present in any real .docx.

Document body structure:
  <w:document>
    <w:body>
      <w:p>                        ← paragraph
        <w:pPr>                    ← paragraph properties
          <w:pStyle w:val="Heading1"/>   ← named style
          <w:jc w:val="center"/>         ← alignment: left|center|right|both
          <w:numPr>                      ← list item
            <w:ilvl w:val="0"/>          ← indent level (0-based)
            <w:numId w:val="1"/>         ← links to word/numbering.xml
          </w:numPr>
        </w:pPr>
        <w:r>                      ← run (inline text)
          <w:rPr>                  ← run properties
            <w:b/>                 ← bold
            <w:i/>                 ← italic
            <w:u w:val="single"/>  ← underline
            <w:color w:val="FF0000"/>
            <w:sz w:val="24"/>     ← half-points (24 = 12pt)
          </w:rPr>
          <w:t xml:space="preserve">Hello world</w:t>
        </w:r>
        <w:hyperlink r:id="rId1">  ← hyperlink (rId defined in .rels file)
          <w:r><w:t>click here</w:t></w:r>
        </w:hyperlink>
      </w:p>
      <w:tbl>                      ← table
        <w:tr>                     ← row
          <w:tc>                   ← cell
            <w:p>...</w:p>
          </w:tc>
        </w:tr>
      </w:tbl>
      <w:sectPr/>                  ← section properties (keep as-is at end of body)
    </w:body>
  </w:document>

Always preserve xml:space="preserve" on <w:t> when text has leading/trailing spaces.
Do not remove <w:sectPr> — it holds page size and margin settings.

━━ Quick text extraction ━━

  readDocx(base64) → markdown string
    Extract document text as Markdown (mammoth + turndown). Loses precise formatting.
    Useful for reading and summarising without parsing XML.

━━ Output ━━

  addOutput(base64, filename) → fileId string
    Persist a file and register it as a tool result attachment.
    MIME type is inferred from the filename extension.
    Call multiple times to emit multiple output files.

  log(message)
    Append a debug message to the tool response.

━━ Example ━━

Open a template, replace placeholder text, save:
  const src = getAttachment(fileId)
  const h = openDocx(src)
  var xml = readXml(h, 'word/document.xml')
  xml = xml.replace(/<w:t([^>]*)>CUSTOMER_NAME<\\/w:t>/g,
                    '<w:t$1>Acme Corp<\\/w:t>')
  writeXml(h, 'word/document.xml', xml)
  const out = saveDocx(h)
  addOutput(out, 'filled.docx')`,

      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description:
              'JavaScript to execute. Call addOutput(base64, filename) to produce output files. Omitting it is valid when the script only reads or inspects documents.',
          },
        },
        required: ['code'],
        additionalProperties: false,
      },

      invoke: async (invokeParams): Promise<dto.ToolCallResultOutput> => {
        const code = String(invokeParams.params.code ?? '')

        type OutputEntry = {
          type: 'file'
          id: string
          mimetype: string
          name: string
          size: number
        }

        const outputEntries: OutputEntry[] = []
        const logs: string[] = []

        try {
          await runInQuickJs(code, invokeParams, outputEntries, logs)
        } catch (err) {
          return {
            type: 'error-text',
            value: `Script error: ${err instanceof Error ? err.message : String(err)}`,
          }
        }

        const logNote =
          logs.length > 0 ? `\nLog:\n${logs.map((l) => `  ${l}`).join('\n')}` : ''

        if (outputEntries.length === 0) {
          return {
            type: 'content',
            value: [
              {
                type: 'text',
                text: 'Script completed without producing output files.' + logNote,
              },
            ],
          }
        }

        return {
          type: 'content',
          value: [
            {
              type: 'text',
              text:
                `Produced ${outputEntries.length} file(s): ` +
                outputEntries.map((e) => `"${e.name}" (${e.size} bytes)`).join(', ') +
                '.' +
                logNote,
            },
            ...outputEntries,
          ],
        }
      },
    },
  }
}

// ---------------------------------------------------------------------------
// QuickJS execution
// ---------------------------------------------------------------------------

async function runInQuickJs(
  userCode: string,
  invokeParams: ToolInvokeParams,
  outputEntries: Array<{
    type: 'file'
    id: string
    mimetype: string
    name: string
    size: number
  }>,
  logs: string[]
): Promise<void> {
  // newAsyncContext() enables newAsyncifiedFunction — host async functions
  // appear synchronous inside the QuickJS script (asyncify transform).
  const { newAsyncContext } = await getQuickJsModule()
  const vm = await newAsyncContext()

  // Open documents keyed by integer handle
  const openDocs = new Map<number, JSZip>()
  let nextHandle = 1

  const reg = <T>(name: string, fn: (...a: any[]) => T) => {
    const h = fn.length === 0
      ? vm.newFunction(name, fn as any)
      : vm.newAsyncifiedFunction(name, fn as any)
    vm.setProp(vm.global, name, h)
    h.dispose()
  }

  try {
    // ── log(message) ───────────────────────────────────────────────────────
    const logFn = vm.newFunction('log', (msgHandle) => {
      logs.push(String(vm.dump(msgHandle)))
    })
    vm.setProp(vm.global, 'log', logFn)
    logFn.dispose()

    // ── getAttachment(fileId) → base64 ─────────────────────────────────────
    reg('getAttachment', async (fileIdHandle: any) => {
      const fileId = String(vm.dump(fileIdHandle))
      const fileEntry = await getFileWithId(fileId)
      if (!fileEntry) throw new Error(`File not found: ${fileId}`)
      if (!(await canAccessFile({ userId: invokeParams.userId }, fileId))) {
        throw new Error(`Access denied: ${fileId}`)
      }
      const bytes = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
      return vm.newString(bytes.toString('base64'))
    })

    // ── openDocx(base64) → handle ──────────────────────────────────────────
    reg('openDocx', async (base64Handle: any) => {
      const buf = Buffer.from(String(vm.dump(base64Handle)), 'base64')
      const zip = await JSZip.loadAsync(buf)
      const handle = nextHandle++
      openDocs.set(handle, zip)
      return vm.newNumber(handle)
    })

    // ── listFiles(handle) → JSON string ────────────────────────────────────
    reg('listFiles', async (handleHandle: any) => {
      const handle = Number(vm.dump(handleHandle))
      const zip = openDocs.get(handle)
      if (!zip) throw new Error(`Invalid docx handle: ${handle}`)
      const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir)
      return vm.newString(JSON.stringify(paths))
    })

    // ── readXml(handle, path) → XML string ────────────────────────────────
    reg('readXml', async (handleHandle: any, pathHandle: any) => {
      const handle = Number(vm.dump(handleHandle))
      const path = String(vm.dump(pathHandle))
      const zip = openDocs.get(handle)
      if (!zip) throw new Error(`Invalid docx handle: ${handle}`)
      const file = zip.file(path)
      if (!file) throw new Error(`File not found in docx: ${path}`)
      const content = await file.async('text')
      return vm.newString(content)
    })

    // ── writeXml(handle, path, xmlString) ─────────────────────────────────
    reg('writeXml', async (handleHandle: any, pathHandle: any, contentHandle: any) => {
      const handle = Number(vm.dump(handleHandle))
      const path = String(vm.dump(pathHandle))
      const content = String(vm.dump(contentHandle))
      const zip = openDocs.get(handle)
      if (!zip) throw new Error(`Invalid docx handle: ${handle}`)
      zip.file(path, content)
      return vm.undefined
    })

    // ── saveDocx(handle) → base64 ──────────────────────────────────────────
    reg('saveDocx', async (handleHandle: any) => {
      const handle = Number(vm.dump(handleHandle))
      const zip = openDocs.get(handle)
      if (!zip) throw new Error(`Invalid docx handle: ${handle}`)
      openDocs.delete(handle)
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
      return vm.newString(buf.toString('base64'))
    })

    // ── readDocx(base64) → markdown string ────────────────────────────────
    reg('readDocx', async (dataHandle: any) => {
      const buf = Buffer.from(String(vm.dump(dataHandle)), 'base64')
      const markdown = await readDocxAsMarkdown(buf)
      return vm.newString(markdown)
    })

    // ── addOutput(base64, filename) → fileId ──────────────────────────────
    reg('addOutput', async (base64Handle: any, filenameHandle: any) => {
      const base64 = String(vm.dump(base64Handle))
      const filename = String(vm.dump(filenameHandle))
      const content = Buffer.from(base64, 'base64')
      const mimeType = (mimeLookup(filename) as string | false) || 'application/octet-stream'

      const dbFile = await materializeFile({
        content,
        name: filename,
        mimeType,
        owner: resolveFileOwner(invokeParams),
      })

      outputEntries.push({
        type: 'file' as const,
        id: dbFile.id,
        mimetype: mimeType,
        name: filename,
        size: content.byteLength,
      })

      return vm.newString(dbFile.id)
    })

    // ── execute user code ──────────────────────────────────────────────────
    const result = await vm.evalCodeAsync(userCode, 'user-script.js')

    if (result.error) {
      const errVal = vm.dump(result.error)
      result.error.dispose()
      const msg =
        errVal && typeof errVal === 'object'
          ? (errVal as any).message ?? JSON.stringify(errVal)
          : String(errVal)
      throw new Error(msg)
    }
    result.value.dispose()
  } finally {
    vm.dispose()
  }
}
