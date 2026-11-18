import { encode as encodeBase64 } from "https://deno.land/std@0.168.0/encoding/base64.ts"
import JSZip from 'npm:jszip@3.10.1'
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs'
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

export function detectKind(mime?: string | null, name?: string | null): FileKind {
  const lowerMime = (mime || '').toLowerCase()
  const ext = (name || '').toLowerCase().split('.').pop() || ''
  if (lowerMime === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (IMAGE_TYPES[ext] || Object.values(IMAGE_TYPES).includes(lowerMime)) return 'image'
  if (ext === 'docx' || lowerMime.includes('wordprocessingml')) return 'docx'
  if (ext === 'pptx' || lowerMime.includes('presentationml')) return 'pptx'
  if (['xlsx', 'xlsm', 'xls'].includes(ext) || lowerMime.includes('spreadsheetml') || lowerMime === 'application/vnd.ms-excel') return 'spreadsheet'
  if (lowerMime.startsWith('text/') || TEXT_MIME_TYPES.has(lowerMime) || ['txt', 'csv', 'json', 'md', 'log'].includes(ext)) return 'text'
  return 'other'
}

function decodeXml(text: string) {
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

function spreadsheetText(bytes: Uint8Array) {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: true })
  return workbook.SheetNames
    .map((name: string) => `Sheet: ${name}\n${XLSX.utils.sheet_to_csv(workbook.Sheets[name], { blankrows: false })}`)
    .join('\n\n')
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

// Turns a downloaded PDF or image into a file Claude reads directly, or says why it can't.
export function toAttachedFile(kind: 'pdf' | 'image', bytes: Uint8Array, name: string, mime?: string | null):
  { file: AttachedFile } | { limitation: string } {
  if (kind === 'pdf') {
    if (bytes.byteLength > MAX_PDF_BYTES) return { limitation: `PDF is ${(bytes.byteLength / 1048576).toFixed(1)} MB, over the ${MAX_PDF_BYTES / 1048576} MB the AI reads.` }
    const pages = countPdfPages(bytes)
    if (pages > MAX_PDF_PAGES) return { limitation: `PDF has ${pages} pages, over the ${MAX_PDF_PAGES} the AI reads.` }
    return { file: { kind: 'pdf', mediaType: 'application/pdf', data: encodeBase64(bytes), name } }
  }

  const ext = name.toLowerCase().split('.').pop() || ''
  const mediaType = IMAGE_TYPES[ext] || (Object.values(IMAGE_TYPES).includes(String(mime)) ? String(mime) : 'image/jpeg')
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { limitation: `Image is ${(bytes.byteLength / 1048576).toFixed(1)} MB, over the 3.75 MB the AI reads.` }
  return { file: { kind: 'image', mediaType, data: encodeBase64(bytes), name } }
}
