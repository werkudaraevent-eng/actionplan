import { decodeXml, type FileKind } from './files.ts'

// Reads evidence shared through Google Docs/Sheets/Slides, Google Drive files and folders, and
// SharePoint "Anyone with the link" links, the way an anonymous visitor would. Only the hosts below
// are ever requested, every redirect is checked against them, and a sign-in page ends the attempt.

export const MAX_LINK_BYTES = 10 * 1024 * 1024 // the same cap as an upload
const LINK_DEADLINE_MS = 20000
const MAX_REDIRECTS = 6
const MAX_FOLDER_ENTRIES = 100

const FETCHABLE_HOSTS = [
  /^docs\.google\.com$/,
  /^drive\.google\.com$/,
  /^drive\.usercontent\.google\.com$/,
  /^[a-z0-9-]+\.googleusercontent\.com$/,
  /^[a-z0-9-]+\.sharepoint\.com$/,
]
const GOOGLE_SIGN_IN = /^accounts\.google\.com$/
const MICROSOFT_SIGN_IN = /^(login\.microsoftonline\.com|login\.live\.com|login\.windows\.net)$/

export type LinkSource = 'google_doc' | 'google_sheet' | 'google_slides' | 'google_drive_file' | 'google_drive_folder' | 'sharepoint_file'

export type LinkPlan =
  | { source: LinkSource, fetchUrl: string, kind?: FileKind }
  // Personal OneDrive opens only for a signed-in account, so these go through Microsoft Graph.
  | { source: 'onedrive', shareUrl: string }
  | { source: 'not_readable', limitation: string }

const NOT_READ = {
  sharepointFolder: 'SharePoint folder links are not opened, so only the link was analyzed. Link the file itself, or upload it.',
  sharepointOther: 'Only SharePoint sharing links (Share, then Copy link with "Anyone with the link") are opened, so only this link was analyzed.',
  googleOther: 'This kind of Google link is not opened, so only the link was analyzed. Link a Google Doc, Sheet, Slides deck, Drive file or Drive folder.',
}

const GOOGLE_EXPORT: Record<string, { source: LinkSource, format: string, kind: FileKind }> = {
  document: { source: 'google_doc', format: 'txt', kind: 'text' },
  spreadsheets: { source: 'google_sheet', format: 'xlsx', kind: 'spreadsheet' },
  presentation: { source: 'google_slides', format: 'pptx', kind: 'pptx' },
}

// Decides how a link is read, or null when it isn't a Google, SharePoint or OneDrive link at all.
export function planLink(raw: string): LinkPlan | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null
  const host = url.hostname.toLowerCase()
  const resourceKey = url.searchParams.get('resourcekey')
  const keyParam = resourceKey ? `&resourcekey=${encodeURIComponent(resourceKey)}` : ''

  if (host === '1drv.ms' || host === 'onedrive.live.com') return { source: 'onedrive', shareUrl: url.toString() }

  if (host === 'docs.google.com') {
    const match = url.pathname.match(/^\/(?:a\/[^/]+\/)?(document|spreadsheets|presentation)\/d\/([\w-]{10,})/)
    if (!match) return { source: 'not_readable', limitation: NOT_READ.googleOther }
    const target = GOOGLE_EXPORT[match[1]]
    return { source: target.source, kind: target.kind, fetchUrl: `https://docs.google.com/${match[1]}/d/${match[2]}/export?format=${target.format}${keyParam}` }
  }

  if (host === 'drive.google.com') {
    const folder = url.pathname.match(/\/folders\/([\w-]{10,})/)
    if (folder) return { source: 'google_drive_folder', fetchUrl: `https://drive.google.com/embeddedfolderview?id=${folder[1]}${keyParam}` }
    const fileId = url.pathname.match(/\/file\/d\/([\w-]{10,})/)?.[1]
      || (['/open', '/uc'].includes(url.pathname) ? url.searchParams.get('id') : null)
    if (fileId && /^[\w-]{10,}$/.test(fileId)) {
      return { source: 'google_drive_file', fetchUrl: `https://drive.google.com/uc?export=download&id=${fileId}${keyParam}` }
    }
    return { source: 'not_readable', limitation: NOT_READ.googleOther }
  }

  if (/^[a-z0-9-]+\.sharepoint\.com$/.test(host)) {
    const type = url.pathname.match(/^\/:([a-z]):\//)?.[1]
    if (!type) return { source: 'not_readable', limitation: NOT_READ.sharepointOther }
    if (type === 'f') return { source: 'not_readable', limitation: NOT_READ.sharepointFolder }
    const download = new URL(url.toString())
    download.protocol = 'https:'
    download.searchParams.set('download', '1')
    return { source: 'sharepoint_file', fetchUrl: download.toString() }
  }

  return null
}

export type FetchedLink =
  | { ok: true, bytes: Uint8Array, contentType: string, fileName: string | null }
  | { ok: false, limitation: string }

function fileNameOf(disposition: string | null) {
  if (!disposition) return null
  const encoded = disposition.match(/filename\*\s*=\s*[^']*''([^;]+)/i)?.[1]
  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim().replace(/^"|"$/g, ''))
    } catch { /* fall through to the plain name */ }
  }
  return disposition.match(/filename\s*=\s*"([^"]+)"/i)?.[1] || disposition.match(/filename\s*=\s*([^;]+)/i)?.[1]?.trim() || null
}

// The body, or null once it passes max bytes (checked against Content-Length first when sent).
export async function readCapped(response: Response, max: number) {
  if (Number(response.headers.get('content-length')) > max) {
    await response.body?.cancel()
    return null
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

const PAGE_INSTEAD_OF_FILE: Record<string, string> = {
  google: 'Google showed a web page instead of the file, so only the link was analyzed. It may not be shared with "Anyone with the link".',
  sharepoint: 'SharePoint showed a web page instead of the file, so only the link was analyzed. The link may block downloads, be limited to specific people, or have expired.',
}

// Follows redirects by hand so each hop's host is checked, carrying cookies within a host because
// SharePoint sets one on the first hop of an anonymous link and expects it back on the next.
export async function fetchLink(fetchUrl: string, expect: 'file' | 'page'): Promise<FetchedLink> {
  const signal = AbortSignal.timeout(LINK_DEADLINE_MS)
  const cookies = new Map<string, Map<string, string>>()
  let url = new URL(fetchUrl)
  const family = url.hostname.endsWith('.sharepoint.com') ? 'sharepoint' : 'google'
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const host = url.hostname.toLowerCase()
      if (GOOGLE_SIGN_IN.test(host)) return { ok: false, limitation: 'The link needs a Google sign-in, so only the link was analyzed. Share it with "Anyone with the link" to have it read.' }
      if (MICROSOFT_SIGN_IN.test(host)) return { ok: false, limitation: 'The link needs a Microsoft sign-in, so only the link was analyzed. Share it with "Anyone with the link" to have it read.' }
      if (url.protocol !== 'https:' || url.port || !FETCHABLE_HOSTS.some((pattern) => pattern.test(host))) {
        return { ok: false, limitation: `The link redirected to ${host}, which is not opened, so only the link was analyzed.` }
      }

      const jar = cookies.get(host)
      const response = await fetch(url, {
        redirect: 'manual',
        signal,
        headers: jar?.size ? { cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; ') } : {},
      })
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(';')
        const eq = pair.indexOf('=')
        if (eq > 0) {
          if (!cookies.has(host)) cookies.set(host, new Map())
          cookies.get(host)!.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
        }
      }

      const location = response.headers.get('location')
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel()
        url = new URL(location, url)
        continue
      }
      if (response.status === 404) {
        await response.body?.cancel()
        return { ok: false, limitation: 'The linked file was not found (404); it may have been deleted or moved. Only the link was analyzed.' }
      }
      if (response.status === 401 || response.status === 403) {
        await response.body?.cancel()
        return { ok: false, limitation: `Access to the linked file was refused (${response.status}), so only the link was analyzed. Share it with "Anyone with the link" to have it read.` }
      }
      if (!response.ok) {
        await response.body?.cancel()
        return { ok: false, limitation: `The linked file could not be fetched (HTTP ${response.status}), so only the link was analyzed.` }
      }

      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (expect === 'file' && contentType === 'text/html') {
        await response.body?.cancel()
        return { ok: false, limitation: PAGE_INSTEAD_OF_FILE[family] }
      }
      const bytes = await readCapped(response, MAX_LINK_BYTES)
      if (!bytes) return { ok: false, limitation: `The linked file is over the ${MAX_LINK_BYTES / 1048576} MB the AI reads, so only the link was analyzed.` }
      return { ok: true, bytes, contentType, fileName: fileNameOf(response.headers.get('content-disposition')) }
    }
    return { ok: false, limitation: 'The link redirected too many times, so only the link was analyzed.' }
  } catch (error) {
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return { ok: false, limitation: `The linked file took longer than ${LINK_DEADLINE_MS / 1000} seconds to download, so only the link was analyzed.` }
    }
    return { ok: false, limitation: `The linked file could not be fetched (${error instanceof Error ? error.message : 'unknown error'}), so only the link was analyzed.` }
  }
}

// The entries of Drive's public folder view: one line per item with its type and last change.
export function folderListing(html: string) {
  const lines: string[] = []
  const chunks = html.split('<div class="flip-entry"').slice(1)
  for (const chunk of chunks.slice(0, MAX_FOLDER_ENTRIES)) {
    const title = chunk.match(/<div class="flip-entry-title">([^<]*)<\/div>/)?.[1]
    if (title === undefined) continue
    const isFolder = /href="[^"]*\/folders\//.test(chunk)
    const type = isFolder ? 'folder' : chunk.match(/<div class="flip-entry-thumb">\s*<img[^>]*\salt="([^"]*)"/)?.[1]
    const modified = chunk.match(/<div class="flip-entry-last-modified"><div>([^<]*)<\/div>/)?.[1]
    const details = [type && decodeXml(type), modified && `modified ${decodeXml(modified)}`].filter(Boolean).join(', ')
    lines.push(`- ${decodeXml(title)}${details ? ` (${details})` : ''}`)
  }
  const more = chunks.length > MAX_FOLDER_ENTRIES ? `\n…and ${chunks.length - MAX_FOLDER_ENTRIES} more items` : ''
  return { count: chunks.length, text: lines.length ? `Shared Google Drive folder with ${chunks.length} item${chunks.length === 1 ? '' : 's'}:\n${lines.join('\n')}${more}` : '' }
}
