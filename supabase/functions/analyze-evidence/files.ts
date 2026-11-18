import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts"
import JSZip from 'npm:jszip@3.10.1'
import type { AttachedFile } from '../_shared/ai.ts'

export const MAX_TEXT_CHARS_PER_FILE = 20000

// Claude reads PDFs and images itself; these bounds keep one assessment's request well under the
// API's 32 MB body limit and its per-image and per-PDF-page limits.
const MAX_PDF_BYTES = 10 * 1024 * 1024
const MAX_PDF_PAGES = 100
const MAX_IMAGE_BYTES = 3.75 * 1024 * 1024 // 5 MB once base64-encoded
const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
}

export type FileKind = 'text' | 'pdf' | 'image' | 'docx' | 'pptx' | 'spreadsheet' | 'other'

const TEXT_MIME_TYPES = new Set(['application/json', 'application/xml', 'application/csv', 'text/csv'])

// The extension decides first: Windows browsers report .csv files as application/vnd.ms-excel.
// Old binary .xls files are 'other', since only the zip-based Office formats are read.
export function detectKind(mime?: string | null, name?: string | null): FileKind {
  const lowerMime = (mime || '').toLowerCase()
  const lowerName = (name || '').toLowerCase()
  const ext = lowerName.includes('.') ? lowerName.split('.').pop() || '' : ''
  if (ext === 'pdf') return 'pdf'
  if (IMAGE_TYPES[ext]) return 'image'
  if (ext === 'docx') return 'docx'
  if (ext === 'pptx') return 'pptx'
  if (ext === 'xlsx' || ext === 'xlsm') return 'spreadsheet'
  if (['txt', 'csv', 'json', 'md', 'log'].includes(ext)) return 'text'
  if (ext) return 'other'
  if (lowerMime === 'application/pdf') return 'pdf'
  if (Object.values(IMAGE_TYPES).includes(lowerMime)) return 'image'
  if (lowerMime.includes('wordprocessingml')) return 'docx'
  if (lowerMime.includes('presentationml')) return 'pptx'
  if (lowerMime.includes('spreadsheetml')) return 'spreadsheet'
  if (lowerMime.startsWith('text/') || TEXT_MIME_TYPES.has(lowerMime)) return 'text'
  return 'other'
}

export function decodeXml(text: string) {
  return text
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
}

// The text of each paragraph in an Office XML part, one paragraph per line.
function paragraphsOf(xml: string, paragraphTag: string, textTag: string) {
  const textRun = new RegExp(`<${textTag}(?:\\s[^>]*)?>([^<]*)</${textTag}>`, 'g')
  return xml
    .split(`</${paragraphTag}>`)
    .map((paragraph) => [...paragraph.matchAll(textRun)].map((m) => decodeXml(m[1])).join(''))
    .filter((line) => line.trim())
}

async function docxText(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  const body = await zip.file('word/document.xml')?.async('string')
  if (!body) throw new Error('word/document.xml is missing')
  return paragraphsOf(body, 'w:p', 'w:t').join('\n')
}

async function pptxText(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  const slides = Object.keys(zip.files)
    .map((path) => ({ path, n: Number(path.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]) }))
    .filter((s) => s.n)
    .sort((a, b) => a.n - b.n)
  const parts = []
  for (const slide of slides) {
    const xml = await zip.file(slide.path)!.async('string')
    parts.push(`Slide ${slide.n}:\n${paragraphsOf(xml, 'a:p', 'a:t').join('\n')}`)
  }
  return parts.join('\n\n')
}

function attr(tag: string, name: string) {
  const value = tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]
  return value === undefined ? undefined : decodeXml(value)
}

// All <t> runs of a shared or inline string, without the phonetic guides Japanese files carry.
function runsText(xml: string) {
  return [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)]
    .map((m) => decodeXml(m[1]))
    .join('')
}

// Excel keeps dates as day numbers; a cell is a date when its style's number format is one.
const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

function dateStyleIndexes(stylesXml?: string) {
  const styles = new Set<number>()
  if (!stylesXml) return styles
  const customDateFormats = new Set<number>()
  for (const [tag] of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) {
    const code = (attr(tag, 'formatCode') || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
    if (/[dmyhs]/i.test(code)) customDateFormats.add(Number(attr(tag, 'numFmtId')))
  }
  const cellXfs = stylesXml.match(/<cellXfs\b[\s\S]*?<\/cellXfs>/)?.[0] || ''
  ;[...cellXfs.matchAll(/<xf\b[^>]*>/g)].forEach(([tag], index) => {
    const formatId = Number(attr(tag, 'numFmtId'))
    if (BUILT_IN_DATE_FORMATS.has(formatId) || customDateFormats.has(formatId)) styles.add(index)
  })
  return styles
}

function serialToDate(serial: number, date1904: boolean) {
  const ms = Math.round((serial + (date1904 ? 1462 : 0)) * 86400000) + Date.UTC(1899, 11, 30)
  const iso = new Date(ms).toISOString()
  if (serial < 1) return iso.slice(11, 16)
  return Number.isInteger(serial) ? iso.slice(0, 10) : `${iso.slice(0, 10)} ${iso.slice(11, 16)}`
}

function columnIndex(ref: string) {
  let index = 0
  for (const letter of ref.match(/^[A-Z]+/)?.[0] || '') index = index * 26 + letter.charCodeAt(0) - 64
  return index - 1
}

const csvField = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

// Each sheet as "Sheet: name" and CSV rows, with blank rows dropped. Stops once there is more
// text than the prompt takes, so a sheet with thousands of rows isn't parsed to the end.
async function spreadsheetText(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes)
  const read = (path: string) => zip.file(path)?.async('string')
  const workbook = await read('xl/workbook.xml')
  if (!workbook) throw new Error('xl/workbook.xml is missing')
  const rels = await read('xl/_rels/workbook.xml.rels') || ''
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map(([tag]) => [attr(tag, 'Id'), attr(tag, 'Target')]))
  const sharedXml = await read('xl/sharedStrings.xml') || ''
  const shared = [...sharedXml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => runsText(m[1] || ''))
  const dateStyles = dateStyleIndexes(await read('xl/styles.xml'))
  const date1904 = /<workbookPr\b[^>]*\sdate1904="(1|true)"/.test(workbook)

  const parts: string[] = []
  let length = 0
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*>/g)]
  for (const [index, [tag]] of sheets.entries()) {
    const relId = attr(tag, 'r:id') || tag.match(/\s\w+:id="([^"]*)"/)?.[1]
    const target = targets.get(relId) || `worksheets/sheet${index + 1}.xml`
    const xml = await read(target.startsWith('/') ? target.slice(1) : `xl/${target}`)
    const data = xml?.match(/<sheetData\b[^>]*>([\s\S]*)<\/sheetData>/)?.[1]
    if (!data) continue

    const lines = [`Sheet: ${attr(tag, 'name') || `Sheet${index + 1}`}`]
    for (const row of data.matchAll(/<row\b(?:[^>]*[^/>])?>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      for (const cell of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = cell[1]
        const body = cell[2] || ''
        const type = attr(attrs, 't') || 'n'
        const raw = body.match(/<v(?:\s[^>]*)?>([^<]*)<\/v>/)?.[1]
        let value = ''
        if (type === 's') value = shared[Number(raw)] ?? ''
        else if (type === 'inlineStr') value = runsText(body)
        else if (type === 'b') value = raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : ''
        else if (raw === undefined) value = ''
        else if (type === 'n' && dateStyles.has(Number(attr(attrs, 's') || 0)) && Number.isFinite(Number(raw))) value = serialToDate(Number(raw), date1904)
        else value = decodeXml(raw)
        const ref = attr(attrs, 'r')
        const column = ref ? columnIndex(ref) : cells.length
        while (cells.length < column) cells.push('')
        cells[column] = csvField(value)
      }
      while (cells.length && cells[cells.length - 1] === '') cells.pop()
      if (cells.length) lines.push(cells.join(','))
    }
    const text = lines.join('\n')
    parts.push(text)
    length += text.length + 2
    if (length > MAX_TEXT_CHARS_PER_FILE) break
  }
  return parts.join('\n\n')
}

export async function extractText(kind: FileKind, bytes: Uint8Array) {
  if (kind === 'docx') return docxText(bytes)
  if (kind === 'pptx') return pptxText(bytes)
  if (kind === 'spreadsheet') return spreadsheetText(bytes)
  return new TextDecoder().decode(bytes)
}

// Page objects are countable only in PDFs without compressed object streams, so 0 means unknown.
function countPdfPages(bytes: Uint8Array) {
  const text = new TextDecoder('latin1').decode(bytes)
  return (text.match(/\/Type\s*\/Page(?![a-zA-Z])/g) || []).length
}

// Compared as bytes: TextDecoder's 'latin1' is really windows-1252, which turns PNG's 0x89 into ‰.
function startsWith(bytes: Uint8Array, signature: number[], offset = 0) {
  return signature.every((byte, i) => bytes[offset + i] === byte)
}
const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0))

function imageTypeOf(bytes: Uint8Array) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png'
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, ascii('GIF8'))) return 'image/gif'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp'
  return null
}

// The kind of a file that arrived without a reliable name, e.g. a SharePoint download sent with
// no filename or a Drive file sent as application/octet-stream: by name and type, then by content.
export async function sniffKind(bytes: Uint8Array, mime?: string | null, name?: string | null): Promise<FileKind> {
  const byLabel = detectKind(mime === 'application/octet-stream' ? null : mime, name)
  if (byLabel !== 'other') return byLabel
  if (startsWith(bytes, ascii('%PDF-'))) return 'pdf'
  if (imageTypeOf(bytes)) return 'image'
  if (startsWith(bytes, ascii('PK'))) {
    try {
      const zip = await JSZip.loadAsync(bytes)
      if (zip.file('word/document.xml')) return 'docx'
      if (zip.file('xl/workbook.xml')) return 'spreadsheet'
      if (zip.file('ppt/presentation.xml')) return 'pptx'
    } catch { /* not a readable zip */ }
  }
  return 'other'
}

// Turns a downloaded PDF or image into a file Claude reads directly, or says why it can't.
export function toAttachedFile(kind: 'pdf' | 'image', bytes: Uint8Array, name: string):
  { file: AttachedFile } | { limitation: string } {
  if (kind === 'pdf') {
    if (bytes.byteLength > MAX_PDF_BYTES) return { limitation: `PDF is ${(bytes.byteLength / 1048576).toFixed(1)} MB, over the ${MAX_PDF_BYTES / 1048576} MB the AI reads.` }
    const pages = countPdfPages(bytes)
    if (pages > MAX_PDF_PAGES) return { limitation: `PDF has ${pages} pages, over the ${MAX_PDF_PAGES} the AI reads.` }
    return { file: { kind: 'pdf', mediaType: 'application/pdf', data: encodeBase64(bytes), name } }
  }

  // The bytes decide, not the name: the API rejects an image whose declared type doesn't match it.
  const mediaType = imageTypeOf(bytes)
  if (!mediaType) return { limitation: 'The image is not in a format the AI reads (JPEG, PNG, GIF or WebP).' }
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { limitation: `Image is ${(bytes.byteLength / 1048576).toFixed(1)} MB, over the 3.75 MB the AI reads.` }
  return { file: { kind: 'image', mediaType, data: encodeBase64(bytes), name } }
}
