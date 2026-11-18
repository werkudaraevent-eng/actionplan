import { deleteVaultSecret, readVaultMeta, readVaultSecret, writeVaultSecret } from './ai.ts'

// Personal OneDrive (1drv.ms) links open only for a signed-in Microsoft account, so evidence links
// are read through Microsoft Graph as one "reader" account an admin connects in Settings. The
// sign-in is the device code flow: the admin gets a code, enters it at microsoft.com/devicelogin,
// and signs in there, so no redirect URL or client secret is involved. The refresh token lives in
// Supabase Vault next to the AI API key.

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0'
const GRAPH = 'https://graph.microsoft.com/v1.0'
const SCOPE = 'Files.Read.All offline_access User.Read'
const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const readerName = (companyId: string) => `onedrive_reader:${companyId}`
const pendingName = (companyId: string) => `onedrive_pending:${companyId}`

type ReaderToken = { client_id: string, refresh_token: string, access_token: string, expires_at: number }
type PendingLogin = { client_id: string, device_code: string, expires_at: number }

// An error whose message is already fit to show an admin or to put in an assessment's limitations.
export class OneDriveError extends Error {}

const form = (body: Record<string, string>) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(body),
})

function parseJson<T>(text: string | null): T | null {
  try {
    return text ? JSON.parse(text) as T : null
  } catch {
    return null
  }
}

export async function getOneDriveStatus(companyId: string) {
  const [reader, pending] = await Promise.all([readVaultMeta(readerName(companyId)), readVaultMeta(pendingName(companyId))])
  const about = parseJson<{ account?: string, client_id?: string, connected_at?: string }>(reader?.description ?? null) || {}
  return {
    connected: !!reader,
    account: about.account || null,
    client_id: about.client_id || null,
    connected_at: about.connected_at || null,
    sign_in_pending: !!pending,
  }
}

export async function startOneDriveLogin(companyId: string, clientId: string) {
  if (!CLIENT_ID.test(clientId)) throw new OneDriveError('The Application (client) ID is a GUID like 00000000-0000-0000-0000-000000000000. Copy it from the app\'s Overview page in Microsoft Entra.')
  const response = await fetch(`${AUTHORITY}/devicecode`, form({ client_id: clientId, scope: SCOPE }))
  const body = await response.json().catch(() => ({}))
  if (!body.device_code) {
    throw new OneDriveError(`Microsoft refused to start the sign-in: ${body.error_description?.split('\r\n')[0] || body.error || `HTTP ${response.status}`}`)
  }
  const pending: PendingLogin = { client_id: clientId, device_code: body.device_code, expires_at: Date.now() + body.expires_in * 1000 }
  await writeVaultSecret(pendingName(companyId), JSON.stringify(pending), JSON.stringify({ started_at: new Date().toISOString() }))
  return { user_code: body.user_code, verification_uri: body.verification_uri, expires_in: body.expires_in, interval: body.interval || 5 }
}

async function accountOf(accessToken: string) {
  const response = await fetch(`${GRAPH}/me?$select=userPrincipalName,mail,displayName`, { headers: { Authorization: `Bearer ${accessToken}` } })
  const me = await response.json().catch(() => ({}))
  return me.userPrincipalName || me.mail || me.displayName || 'Microsoft account'
}

// One check of a sign-in started by startOneDriveLogin. The admin's browser calls this every few
// seconds until the code is used, expires or is declined.
export async function pollOneDriveLogin(companyId: string, userId: string) {
  const pending = parseJson<PendingLogin>(await readVaultSecret(pendingName(companyId)))
  if (!pending) return { status: 'none' as const }
  if (Date.now() > pending.expires_at) {
    await deleteVaultSecret(pendingName(companyId))
    return { status: 'expired' as const }
  }

  const response = await fetch(`${AUTHORITY}/token`, form({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: pending.client_id,
    device_code: pending.device_code,
  }))
  const body = await response.json().catch(() => ({}))
  if (body.error === 'authorization_pending' || body.error === 'slow_down') return { status: 'pending' as const }
  if (!body.access_token) {
    await deleteVaultSecret(pendingName(companyId))
    if (body.error === 'expired_token') return { status: 'expired' as const }
    if (body.error === 'authorization_declined') return { status: 'declined' as const }
    throw new OneDriveError(`Microsoft did not complete the sign-in: ${body.error_description?.split('\r\n')[0] || body.error || `HTTP ${response.status}`}`)
  }
  if (!body.refresh_token) {
    await deleteVaultSecret(pendingName(companyId))
    throw new OneDriveError('Microsoft signed in but gave no refresh token. Add the offline_access permission to the app in Microsoft Entra and connect again.')
  }

  const account = await accountOf(body.access_token)
  const token: ReaderToken = {
    client_id: pending.client_id,
    refresh_token: body.refresh_token,
    access_token: body.access_token,
    expires_at: Date.now() + body.expires_in * 1000,
  }
  const about = { account, client_id: pending.client_id, connected_by: userId, connected_at: new Date().toISOString() }
  await writeVaultSecret(readerName(companyId), JSON.stringify(token), JSON.stringify(about))
  await deleteVaultSecret(pendingName(companyId))
  return { status: 'connected' as const, account }
}

export async function disconnectOneDrive(companyId: string) {
  await Promise.all([deleteVaultSecret(readerName(companyId)), deleteVaultSecret(pendingName(companyId))])
}

// An access token for the reader account, refreshed and saved back when it is about to run out.
// Microsoft hands out a new refresh token with each refresh, which keeps the connection alive as
// long as it is used at least once every 90 days.
export async function getGraphToken(companyId: string): Promise<string> {
  const token = parseJson<ReaderToken>(await readVaultSecret(readerName(companyId)))
  if (!token) throw new OneDriveError('OneDrive links are read through a Microsoft reader account, and none is connected. An admin can connect one in Settings → System → OneDrive Links.')
  if (token.access_token && token.expires_at - 120000 > Date.now()) return token.access_token

  const response = await fetch(`${AUTHORITY}/token`, form({
    grant_type: 'refresh_token',
    client_id: token.client_id,
    refresh_token: token.refresh_token,
    scope: SCOPE,
  }))
  const body = await response.json().catch(() => ({}))
  if (!body.access_token) {
    if (body.error === 'invalid_grant') throw new OneDriveError('The OneDrive reader account\'s sign-in has expired or was revoked. An admin can reconnect it in Settings → System → OneDrive Links.')
    throw new OneDriveError(`Microsoft did not renew the OneDrive reader sign-in: ${body.error_description?.split('\r\n')[0] || body.error || `HTTP ${response.status}`}`)
  }
  const renewed: ReaderToken = {
    ...token,
    access_token: body.access_token,
    refresh_token: body.refresh_token || token.refresh_token,
    expires_at: Date.now() + body.expires_in * 1000,
  }
  await writeVaultSecret(readerName(companyId), JSON.stringify(renewed), null)
  return renewed.access_token
}

export function isOneDriveLink(raw: string) {
  try {
    const host = new URL(raw.trim()).hostname.toLowerCase()
    return host === '1drv.ms' || host === 'onedrive.live.com'
  } catch {
    return false
  }
}

const shareId = (url: string) => `u!${btoa(String.fromCharCode(...new TextEncoder().encode(url.trim()))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-')}`

// The link to hand Graph. Opening a 1drv.ms link lands on a onedrive.live.com address that keeps
// the original link, base64-encoded, in its redeem parameter, and that address is often what
// gets copied from the browser bar. Graph opens only the original.
export function shareLinkOf(raw: string): string {
  const url = new URL(raw.trim())
  const redeem = url.hostname.toLowerCase() === 'onedrive.live.com' ? url.searchParams.get('redeem') : null
  if (redeem) {
    try {
      const original = new URL(new TextDecoder().decode(Uint8Array.from(atob(redeem.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))
      if (original.hostname.toLowerCase() === '1drv.ms') return original.toString()
    } catch {
      // Not an encoded link; try the address as given.
    }
  }
  return url.toString()
}

export type SharedItem = {
  name: string
  size: number
  mimeType: string | null
  isFolder: boolean
  childCount: number | null
  modified: string | null
  downloadUrl: string | null
}

function toItem(raw: any): SharedItem {
  return {
    name: String(raw.name || ''),
    size: Number(raw.size) || 0,
    mimeType: raw.file?.mimeType || null,
    isFolder: !!raw.folder,
    childCount: raw.folder ? Number(raw.folder.childCount) || 0 : null,
    modified: raw.lastModifiedDateTime || null,
    downloadUrl: raw['@microsoft.graph.downloadUrl'] || null,
  }
}

// What Graph says about a sharing link, as the reader account. Redeeming the link "if necessary"
// grants the reader access for this request only, so links don't pile up in its Shared list.
async function graphShare(accessToken: string, url: string, path: string, signal?: AbortSignal) {
  const link = shareLinkOf(url)
  const response = await fetch(`${GRAPH}/shares/${shareId(link)}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'redeemSharingLinkIfNecessary' },
    signal,
  })
  const body = await response.json().catch(() => ({}))
  if (response.ok) return body
  if (response.status === 401) throw new OneDriveError('Microsoft refused the OneDrive reader account\'s sign-in (401). An admin can reconnect it in Settings → System → OneDrive Links.')
  if (response.status === 403) throw new OneDriveError('The OneDrive link is not open to the reader account (403): it may be shared with specific people only. Share it with "Anyone with the link", or with the reader account.')
  if (response.status === 404) throw new OneDriveError('The OneDrive file was not found (404); it may have been deleted or moved, or the link was removed.')
  if (response.status === 400 && new URL(link).hostname.toLowerCase() === 'onedrive.live.com') {
    throw new OneDriveError('This is the address of an open OneDrive page, not a share link, so the reader account cannot open it. In OneDrive, use Share → Copy link and attach that link instead.')
  }
  throw new OneDriveError(`OneDrive could not be read (HTTP ${response.status}${body?.error?.code ? `, ${body.error.code}` : ''}).`)
}

export async function getSharedItem(accessToken: string, url: string, signal?: AbortSignal): Promise<SharedItem> {
  return toItem(await graphShare(accessToken, url, '/driveItem', signal))
}

export async function listSharedFolder(accessToken: string, url: string, signal?: AbortSignal): Promise<{ items: SharedItem[], more: boolean }> {
  const body = await graphShare(accessToken, url, '/driveItem/children?$top=200', signal)
  return { items: (body.value || []).map(toItem), more: !!body['@odata.nextLink'] }
}
