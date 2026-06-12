import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import { OfficeQuickJsInterface, OfficeQuickJsSchema } from '@/lib/tools/schemas'
import { LlmModel } from '@/lib/chat/models'
import * as dto from '@/types/dto'
import { materializeFile } from '@/backend/lib/files/materialize'
import { resolveFileOwner } from '@/backend/lib/tools/ownership'
import { getFileWithId } from '@/models/file'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { storage } from '@/lib/storage'
import { findExtractor } from '@/lib/textextraction'
import { lookup as mimeLookup } from 'mime-types'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'
// Static import: a runtime dynamic import can deadlock forever under tsx watch
// (module-hooks worker wedge), pinning every office_script call on a dead promise.
import { newAsyncContext } from 'quickjs-emscripten'

export class OfficeQuickJsTool extends OfficeQuickJsInterface implements ToolImplementation {
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new OfficeQuickJsTool(toolParams, OfficeQuickJsSchema.parse(params))

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
    office_script: {
      description: `Execute JavaScript in a sandboxed QuickJS VM to create, read, and transform Office documents:
Word (.docx), PowerPoint (.pptx), and Excel (.xlsx).

━━ IMPORTANT: host functions are SYNCHRONOUS — do NOT use await ━━
  (They are async on the host but appear synchronous inside QuickJS via asyncify.)

━━ Blobs ━━

Binary data stays on the host; scripts pass opaque blob ids (strings) around.

  getAttachment(fileId) → blob
    Read an uploaded attachment into a blob.
  blobSize(blob) → number          — size in bytes
  blobFromBase64(base64) → blob    — only when raw bytes must be produced in-script
  blobToBase64(blob) → base64      — only when raw bytes must be inspected in-script

━━ Quick reading (lossy text extraction) ━━

  extractText(blob, filename) → string
    The filename extension selects the converter:
    .docx → Markdown; .xlsx → Markdown tables (one section per sheet);
    .pptx → JSON text dump; .pdf → text.
    Great for reading and summarising. Use the XML functions below for precision.

━━ High-level creation ━━

  createXlsx(specJson) → blob
    Preferred way to produce a spreadsheet. specJson is a JSON string:
      { "sheets": [ { "name": "Sales",
                      "rows": [ ["Region","Total"], ["EMEA",1200] ],
                      "columnWidths": [20, 12] } ] }
    Cell values: string | number | boolean | null | { "formula": "SUM(B2:B9)" }.
    For styling beyond this, open the result with openDocument and edit the XML.

━━ OOXML ZIP/XML access (full power; works for all three formats) ━━

A .docx/.pptx/.xlsx file is a ZIP archive whose content lives in XML parts.

  openDocument(blob) → handle (integer)
    Open a document. Multiple documents can be open simultaneously.
  newDocument() → handle
    Start from an empty archive — for building a document fully from scratch
    (remember [Content_Types].xml and _rels/.rels).
  listFiles(handle) → JSON string (string[])    — part paths inside the ZIP
  readXml(handle, path) → XML string            — read a text/XML part
  writeXml(handle, path, xmlString)             — write/replace a text/XML part
  readPart(handle, path) → blob                 — read a binary part (e.g. word/media/image1.png)
  writePart(handle, path, blob)                 — write/replace a binary part
  removePart(handle, path)                      — delete a part
  saveDocument(handle) → blob                   — repack the ZIP; the handle is disposed

━━ Word structure (word/document.xml) ━━

Namespaces: w: (WordprocessingML), r: (relationships). Already declared in any real .docx.
Other parts: word/_rels/document.xml.rels (rIds → hyperlink URLs), word/styles.xml,
word/numbering.xml, [Content_Types].xml.

  <w:body>
    <w:p>                        ← paragraph
      <w:pPr>                    ← paragraph properties
        <w:pStyle w:val="Heading1"/>
        <w:jc w:val="center"/>         ← alignment: left|center|right|both
        <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>  ← list item
      </w:pPr>
      <w:r>                      ← run (inline text)
        <w:rPr>                  ← <w:b/> bold, <w:i/> italic, <w:u w:val="single"/>,
                                   <w:color w:val="FF0000"/>, <w:sz w:val="24"/> (half-points)
        </w:rPr>
        <w:t xml:space="preserve">Hello world</w:t>
      </w:r>
      <w:hyperlink r:id="rId1"><w:r><w:t>click here</w:t></w:r></w:hyperlink>
    </w:p>
    <w:tbl><w:tr><w:tc><w:p>...</w:p></w:tc></w:tr></w:tbl>   ← table/row/cell
    <w:sectPr/>                  ← page setup — keep as-is at end of body
  </w:body>

Preserve xml:space="preserve" on <w:t> when text has leading/trailing spaces.

━━ PowerPoint structure (ppt/**) ━━

Key parts:
  ppt/presentation.xml             — slide order: <p:sldIdLst><p:sldId id="256" r:id="rId1"/>...
  ppt/_rels/presentation.xml.rels  — rIds → slides/slideN.xml
  ppt/slides/slideN.xml            — slide content
  ppt/slides/_rels/slideN.xml.rels — the slide's images and layout relationships
  [Content_Types].xml              — must contain an Override for every slide part

Slide content (namespaces p:, a:, r:):
  <p:sld><p:cSld><p:spTree>
    <p:sp>                       ← shape (text box / placeholder)
      <p:nvSpPr>...<p:ph type="title|body|ctrTitle"/>...</p:nvSpPr>
      <p:txBody>
        <a:p><a:r><a:rPr lang="en-US" sz="2400" b="1"/><a:t>text here</a:t></a:r></a:p>
      </p:txBody>
    </p:sp>
    <p:pic>...</p:pic>           ← image (r:embed points to a rel in the slide's .rels)
  </p:spTree></p:cSld></p:sld>

All visible text lives in <a:t>. Font size sz is in hundredths of a point (2400 = 24pt).
Prefer editing a template deck over building a .pptx from scratch. To add a slide, clone one:
  1. write the new slide XML to ppt/slides/slideN.xml (N unused)
  2. copy its rels file to ppt/slides/_rels/slideN.xml.rels
  3. add an <Override> for it in [Content_Types].xml
  4. add a <Relationship> in ppt/_rels/presentation.xml.rels (new unique rId)
  5. append <p:sldId id="..." r:id="..."/> to <p:sldIdLst> (id unique, ≥ 256)

━━ Excel raw XML (xl/**) ━━

Key parts: xl/workbook.xml (sheet names → r:id), xl/_rels/workbook.xml.rels,
xl/worksheets/sheetN.xml (cells), xl/sharedStrings.xml (shared string table).

  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>     ← t="s": <v> is an index into sharedStrings.xml
      <c r="B1"><v>42</v></c>          ← no t: number
    </row>
  </sheetData>

When editing cells, the simplest reliable form is an inline string — it avoids maintaining
sharedStrings.xml:  <c r="A2" t="inlineStr"><is><t>text</t></is></c>
When adding cells outside the current range, update <dimension ref="A1:B2"/> accordingly —
readers may ignore cells beyond it.
Prefer createXlsx() for new files; use raw XML to edit existing ones.

━━ Output ━━

  addOutput(blob, filename) → fileId
    Persist a blob and attach it to the tool result. MIME type inferred from the extension.
    Call multiple times to emit multiple output files. Optional — scripts that only read are valid.
  log(message)
    Append a debug message to the tool response.

━━ Examples ━━

Fill a Word template:
  const h = openDocument(getAttachment(fileId))
  var xml = readXml(h, 'word/document.xml')
  xml = xml.replace(/<w:t([^>]*)>CUSTOMER_NAME<\\/w:t>/g,
                    '<w:t$1>Acme Corp<\\/w:t>')
  writeXml(h, 'word/document.xml', xml)
  addOutput(saveDocument(h), 'filled.docx')

Create a spreadsheet:
  const blob = createXlsx(JSON.stringify({ sheets: [{ name: 'Q1',
    rows: [['Region','Sales'], ['EMEA', 1200], ['APAC', 900],
           ['Total', { formula: 'SUM(B2:B3)' }]] }] }))
  addOutput(blob, 'report.xlsx')`,

      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description:
              'JavaScript to execute. Call addOutput(blob, filename) to produce output files. Omitting it is valid when the script only reads or inspects documents.',
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

        const logNote = logs.length > 0 ? `\nLog:\n${logs.map((l) => `  ${l}`).join('\n')}` : ''

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
  const vm = await newAsyncContext()

  // Open documents keyed by integer handle
  const openDocs = new Map<number, JSZip>()
  let nextDocHandle = 1

  // Binary data stays host-side; scripts hold opaque blob ids
  const blobs = new Map<string, Buffer>()
  let nextBlobId = 1
  const putBlob = (buf: Buffer): string => {
    const id = `blob:${nextBlobId++}`
    blobs.set(id, buf)
    return id
  }
  const getBlob = (id: string): Buffer => {
    const buf = blobs.get(id)
    if (!buf) throw new Error(`Invalid blob id: ${id}`)
    return buf
  }
  const getDoc = (handle: number): JSZip => {
    const zip = openDocs.get(handle)
    if (!zip) throw new Error(`Invalid document handle: ${handle}`)
    return zip
  }

  const reg = <T>(name: string, fn: (...a: any[]) => T) => {
    const h =
      fn.length === 0 ? vm.newFunction(name, fn as any) : vm.newAsyncifiedFunction(name, fn as any)
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

    // ── getAttachment(fileId) → blob ───────────────────────────────────────
    reg('getAttachment', async (fileIdHandle: any) => {
      const fileId = String(vm.dump(fileIdHandle))
      const fileEntry = await getFileWithId(fileId)
      if (!fileEntry) throw new Error(`File not found: ${fileId}`)
      if (!(await canAccessFile({ userId: invokeParams.userId }, fileId))) {
        throw new Error(`Access denied: ${fileId}`)
      }
      const bytes = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
      return vm.newString(putBlob(bytes))
    })

    // ── blob helpers ───────────────────────────────────────────────────────
    reg('blobSize', async (blobHandle: any) => {
      return vm.newNumber(getBlob(String(vm.dump(blobHandle))).byteLength)
    })

    reg('blobFromBase64', async (base64Handle: any) => {
      return vm.newString(putBlob(Buffer.from(String(vm.dump(base64Handle)), 'base64')))
    })

    reg('blobToBase64', async (blobHandle: any) => {
      return vm.newString(getBlob(String(vm.dump(blobHandle))).toString('base64'))
    })

    // ── openDocument(blob) → handle ────────────────────────────────────────
    reg('openDocument', async (blobHandle: any) => {
      const zip = await JSZip.loadAsync(getBlob(String(vm.dump(blobHandle))))
      const handle = nextDocHandle++
      openDocs.set(handle, zip)
      return vm.newNumber(handle)
    })

    // ── newDocument() → handle ─────────────────────────────────────────────
    const newDocumentFn = vm.newFunction('newDocument', () => {
      const handle = nextDocHandle++
      openDocs.set(handle, new JSZip())
      return vm.newNumber(handle)
    })
    vm.setProp(vm.global, 'newDocument', newDocumentFn)
    newDocumentFn.dispose()

    // ── listFiles(handle) → JSON string ────────────────────────────────────
    reg('listFiles', async (handleHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const paths = Object.keys(zip.files).filter((p) => !zip.files[p].dir)
      return vm.newString(JSON.stringify(paths))
    })

    // ── readXml(handle, path) → XML string ────────────────────────────────
    reg('readXml', async (handleHandle: any, pathHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const path = String(vm.dump(pathHandle))
      const file = zip.file(path)
      if (!file) throw new Error(`File not found in document: ${path}`)
      const content = await file.async('text')
      return vm.newString(content)
    })

    // ── writeXml(handle, path, xmlString) ─────────────────────────────────
    reg('writeXml', async (handleHandle: any, pathHandle: any, contentHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const path = String(vm.dump(pathHandle))
      const content = String(vm.dump(contentHandle))
      zip.file(path, content)
      return vm.undefined
    })

    // ── readPart(handle, path) → blob ──────────────────────────────────────
    reg('readPart', async (handleHandle: any, pathHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const path = String(vm.dump(pathHandle))
      const file = zip.file(path)
      if (!file) throw new Error(`File not found in document: ${path}`)
      return vm.newString(putBlob(await file.async('nodebuffer')))
    })

    // ── writePart(handle, path, blob) ──────────────────────────────────────
    reg('writePart', async (handleHandle: any, pathHandle: any, blobHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      const path = String(vm.dump(pathHandle))
      zip.file(path, getBlob(String(vm.dump(blobHandle))))
      return vm.undefined
    })

    // ── removePart(handle, path) ───────────────────────────────────────────
    reg('removePart', async (handleHandle: any, pathHandle: any) => {
      const zip = getDoc(Number(vm.dump(handleHandle)))
      zip.remove(String(vm.dump(pathHandle)))
      return vm.undefined
    })

    // ── saveDocument(handle) → blob ────────────────────────────────────────
    reg('saveDocument', async (handleHandle: any) => {
      const handle = Number(vm.dump(handleHandle))
      const zip = getDoc(handle)
      openDocs.delete(handle)
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
      return vm.newString(putBlob(buf))
    })

    // ── extractText(blob, filename) → string ──────────────────────────────
    reg('extractText', async (blobHandle: any, filenameHandle: any) => {
      const buf = getBlob(String(vm.dump(blobHandle)))
      const filename = String(vm.dump(filenameHandle))
      const mimeType = (mimeLookup(filename) as string | false) || 'application/octet-stream'
      const extractor = findExtractor(mimeType)
      if (!extractor) throw new Error(`No text extractor for "${filename}" (${mimeType})`)
      return vm.newString(await extractor(buf))
    })

    // ── createXlsx(specJson) → blob ────────────────────────────────────────
    reg('createXlsx', async (specHandle: any) => {
      const spec = JSON.parse(String(vm.dump(specHandle)))
      if (!spec || !Array.isArray(spec.sheets) || spec.sheets.length === 0) {
        throw new Error('createXlsx: spec must be {"sheets":[{"rows":[[...]]}]}')
      }
      const wb = new ExcelJS.Workbook()
      spec.sheets.forEach((sheet: any, i: number) => {
        const ws = wb.addWorksheet(String(sheet.name ?? `Sheet${i + 1}`))
        for (const row of sheet.rows ?? []) {
          if (!Array.isArray(row)) throw new Error('createXlsx: each row must be an array')
          ws.addRow(row)
        }
        const widths: unknown[] = Array.isArray(sheet.columnWidths) ? sheet.columnWidths : []
        widths.forEach((w, c) => {
          if (typeof w === 'number' && w > 0) ws.getColumn(c + 1).width = w
        })
      })
      const buf = Buffer.from(await wb.xlsx.writeBuffer())
      return vm.newString(putBlob(buf))
    })

    // ── addOutput(blob, filename) → fileId ─────────────────────────────────
    reg('addOutput', async (blobHandle: any, filenameHandle: any) => {
      const content = getBlob(String(vm.dump(blobHandle)))
      const filename = String(vm.dump(filenameHandle))
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
