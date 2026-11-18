import { getGraphToken, getSharedItem, listSharedFolder, OneDriveError, type SharedItem } from '../_shared/onedrive.ts'
import { detectKind, type FileKind } from './files.ts'
import { MAX_LINK_BYTES, readCapped } from './links.ts'

// Reads a personal OneDrive link through Microsoft Graph as the connected reader account: a file's
// bytes, or a folder's item list plus the first few files in it the AI can read.

const ONEDRIVE_DEADLINE_MS = 30000
const MAX_FOLDER_FILES = 3
const MAX_LISTED_ITEMS = 100
// Documents first: an evidence folder often holds one report among many photos.
const KIND_ORDER: FileKind[] = ['pdf', 'docx', 'spreadsheet', 'pptx', 'text', 'image']

export type OneDriveFile = { name: string, mimeType: string | null, bytes: Uint8Array }
export type OneDriveSkipped = { name: string, limitation: string }

export type OneDriveRead =
  | { ok: false, limitation: string }
  | { ok: true, file: OneDriveFile }
  | { ok: true, folder: { name: string, listing: string, read: number, files: (OneDriveFile | OneDriveSkipped)[] } }

const megabytes = (bytes: number) => `${(bytes / 1048576).toFixed(1)} MB`

function sizeLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`
  return megabytes(bytes)
}

async function download(item: SharedItem, signal: AbortSignal): Promise<OneDriveFile | OneDriveSkipped> {
  if (item.size > MAX_LINK_BYTES) return { name: item.name, limitation: `The file is ${megabytes(item.size)}, over the ${MAX_LINK_BYTES / 1048576} MB the AI reads, so only its name was analyzed.` }
  if (!item.downloadUrl) return { name: item.name, limitation: 'OneDrive gave no download address for this file, so only its name was analyzed.' }
  // The download address is pre-authorized and short-lived, so it is fetched without the token.
  const response = await fetch(item.downloadUrl, { signal })
  if (!response.ok) {
    await response.body?.cancel()
    return { name: item.name, limitation: `OneDrive refused the download (HTTP ${response.status}), so only the name was analyzed.` }
  }
  const bytes = await readCapped(response, MAX_LINK_BYTES)
  if (!bytes) return { name: item.name, limitation: `The file is over the ${MAX_LINK_BYTES / 1048576} MB the AI reads, so only its name was analyzed.` }
  return { name: item.name, mimeType: item.mimeType, bytes }
}

function listingOf(folder: SharedItem, items: SharedItem[], more: boolean) {
  const lines = items.slice(0, MAX_LISTED_ITEMS).map((item) => {
    const details = [
      item.isFolder ? `folder, ${item.childCount} items` : sizeLabel(item.size),
      item.modified && `modified ${item.modified.slice(0, 10)}`,
    ].filter(Boolean).join(', ')
    return `- ${item.name} (${details})`
  })
  const hidden = items.length - lines.length
  const tail = hidden > 0 || more ? `\n…and ${more ? 'more' : hidden} items not listed` : ''
  return `Shared OneDrive folder "${folder.name}" with ${folder.childCount ?? items.length} items:\n${lines.join('\n')}${tail}`
}

export async function readOneDriveLink(companyId: string | null, url: string): Promise<OneDriveRead> {
  if (!companyId) return { ok: false, limitation: 'This plan has no company, so no OneDrive reader account could be used. Only the link was analyzed.' }
  const signal = AbortSignal.timeout(ONEDRIVE_DEADLINE_MS)
  try {
    const token = await getGraphToken(companyId)
    const item = await getSharedItem(token, url, signal)

    if (!item.isFolder) {
      const file = await download(item, signal)
      return 'limitation' in file ? { ok: false, limitation: file.limitation } : { ok: true, file }
    }

    const { items, more } = await listSharedFolder(token, url, signal)
    if (!items.length) return { ok: false, limitation: 'The OneDrive folder is empty, so there was nothing to analyze.' }
    const readable = items
      .filter((child) => !child.isFolder && child.size <= MAX_LINK_BYTES)
      .map((child) => ({ child, rank: KIND_ORDER.indexOf(detectKind(child.mimeType, child.name)) }))
      .filter(({ rank }) => rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, MAX_FOLDER_FILES)
      .map(({ child }) => child)
    const files = await Promise.all(readable.map((child) => download(child, signal)))
    return { ok: true, folder: { name: item.name, listing: listingOf(item, items, more), read: files.length, files } }
  } catch (error) {
    if (error instanceof OneDriveError) return { ok: false, limitation: `${error.message} Only the link was analyzed.` }
    if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      return { ok: false, limitation: `OneDrive took longer than ${ONEDRIVE_DEADLINE_MS / 1000} seconds to answer, so only the link was analyzed.` }
    }
    return { ok: false, limitation: `OneDrive could not be read (${error instanceof Error ? error.message : 'unknown error'}), so only the link was analyzed.` }
  }
}
