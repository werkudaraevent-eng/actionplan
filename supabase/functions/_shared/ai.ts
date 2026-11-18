import Anthropic from 'npm:@anthropic-ai/sdk@1.4.0'
import postgres from 'npm:postgres@3.4.5'

export type AiProvider = 'anthropic' | 'openai_compatible'

export type AiConfig = {
  enabled?: boolean
  provider?: AiProvider | null
  proxy_url?: string | null
  model_fast?: string | null
  model_reasoning?: string | null
  timeout_ms?: number | string | null
  vision?: boolean
}

// A PDF or image Claude reads directly. data is base64.
export type AttachedFile = {
  kind: 'pdf' | 'image'
  mediaType: string
  data: string
  name: string
}

export type GenerateJsonOptions = {
  provider: AiProvider
  apiKey: string
  baseUrl?: string
  model: string
  system: string
  prompt: string
  schema: Record<string, unknown>
  timeoutMs: number
  // Sent ahead of the prompt on the Anthropic path; the proxy path does not take files.
  files?: AttachedFile[]
  // The OpenAI-compatible proxy path keeps the request shape it always sent.
  vision?: boolean
  temperature?: number
  maxTokens?: number
}

export type GenerateJsonResult = {
  // Set on the Anthropic path, where structured outputs guarantee the JSON. The proxy path
  // returns the raw response and each function parses it as before.
  parsed: Record<string, unknown> | null
  raw: unknown
  usage: { input_tokens: number, output_tokens: number } | null
  model: string | null
}

// An error whose message is already fit to show an admin.
export class AiProviderError extends Error {}

// Supabase secrets used before keys could be saved in Settings. Only the proxy path has them.
const SECRET_KEY_FALLBACK: Record<AiProvider, string[]> = {
  anthropic: [],
  openai_compatible: ['AI_PROXY_KEY', 'NINEROUTER_API_KEY'],
}

// Models that accept the server-side refusal fallback; elsewhere the parameter is a 400.
const SERVER_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'])

export function parseProvider(value: unknown): AiProvider {
  if (value === 'anthropic' || value === 'openai_compatible') return value
  throw new Error(`Unknown AI provider: '${value}'`)
}

// Settings saved before the provider picker existed only have a proxy URL. One pointing at
// api.anthropic.com was meant for Claude; anything else is the OpenAI-compatible proxy (9router).
export function resolveProvider(config: AiConfig): AiProvider {
  if (config.provider === 'anthropic' || config.provider === 'openai_compatible') return config.provider
  return /^https?:\/\/api\.anthropic\.com/i.test(String(config.proxy_url || '').trim()) ? 'anthropic' : 'openai_compatible'
}

export function resolveTimeoutMs(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(5000, Math.min(300000, parsed))
}

export function resolveProxyUrl(configUrl: unknown) {
  return String(configUrl || Deno.env.get('AI_PROXY_URL') || Deno.env.get('NINEROUTER_API_URL') || '').trim()
}

export async function getAiConfig(supabaseAdmin: any, companyId: string | null): Promise<AiConfig> {
  if (!companyId) return {}

  const { data } = await supabaseAdmin
    .from('system_settings')
    .select('ai_config')
    .eq('company_id', companyId)
    .maybeSingle()

  return data?.ai_config || {}
}

// ── API keys saved in Settings ──────────────────────────────────────────────
// Keys live in Supabase Vault, read over the function's own database connection. system_settings
// is readable by anyone, and a vault reader exposed through the REST API would hand the key to
// whoever holds the service role key, so neither is used.

function secretName(companyId: string, provider: AiProvider) {
  return `ai_api_key:${companyId}:${provider}`
}

function keyHint(apiKey: string) {
  if (apiKey.length <= 12) return `…${apiKey.slice(-2)}`
  return `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}`
}

async function withVault<T>(run: (sql: any) => Promise<T>): Promise<T> {
  const dbUrl = Deno.env.get('SUPABASE_DB_URL')
  if (!dbUrl) throw new Error('Missing SUPABASE_DB_URL, so API keys saved in Settings cannot be reached')
  const sql = postgres(dbUrl, { prepare: false, max: 1 })
  try {
    return await run(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

export async function readStoredKey(companyId: string, provider: AiProvider): Promise<string | null> {
  return withVault(async (sql) => {
    const rows = await sql`select decrypted_secret from vault.decrypted_secrets where name = ${secretName(companyId, provider)} limit 1`
    return rows[0]?.decrypted_secret || null
  })
}

export async function saveStoredKey(companyId: string, provider: AiProvider, apiKey: string, userId: string) {
  const name = secretName(companyId, provider)
  const description = JSON.stringify({ hint: keyHint(apiKey), updated_by: userId })
  await withVault(async (sql) => {
    const [existing] = await sql`select id from vault.secrets where name = ${name}`
    if (existing) {
      await sql`select vault.update_secret(${existing.id}, ${apiKey}, ${name}, ${description})`
    } else {
      await sql`select vault.create_secret(${apiKey}, ${name}, ${description})`
    }
  })
}

export async function deleteStoredKey(companyId: string, provider: AiProvider) {
  await withVault((sql) => sql`delete from vault.secrets where name = ${secretName(companyId, provider)}`)
}

export async function getKeyStatus(companyId: string) {
  const providers: AiProvider[] = ['anthropic', 'openai_compatible']
  const rows = await withVault<{ name: string, description: string | null, updated_at: string | null }[]>((sql) => sql`
    select name, description, updated_at from vault.secrets
    where name in ${sql(providers.map((p) => secretName(companyId, p)))}
  `)

  const keys: Record<string, { stored: boolean, hint: string | null, updated_at: string | null }> = {}
  const secretFallback: Record<string, string | null> = {}
  for (const provider of providers) {
    const row = rows.find((r) => r.name === secretName(companyId, provider))
    let hint = null
    try { hint = JSON.parse(row?.description || '{}').hint || null } catch (_) { /* hand-edited description */ }
    keys[provider] = { stored: !!row, hint, updated_at: row?.updated_at ? new Date(row.updated_at).toISOString() : null }
    secretFallback[provider] = SECRET_KEY_FALLBACK[provider].find((n) => Deno.env.get(n)) || null
  }
  return { keys, secret_fallback: secretFallback }
}

// The key saved in Settings wins; the proxy path falls back to its Supabase secret.
export async function resolveApiKey(companyId: string | null, provider: AiProvider): Promise<string> {
  let vaultError: unknown = null
  if (companyId) {
    try {
      const stored = await readStoredKey(companyId, provider)
      if (stored) return stored
    } catch (error) {
      vaultError = error
      console.error('Reading the saved AI key failed:', error)
    }
  }

  for (const name of SECRET_KEY_FALLBACK[provider]) {
    const value = Deno.env.get(name)
    if (value) return value
  }

  if (vaultError) throw new AiProviderError(`The saved API key could not be read: ${vaultError instanceof Error ? vaultError.message : vaultError}`)
  throw new AiProviderError(provider === 'anthropic'
    ? 'No Anthropic API key saved. Add one in Settings → System → AI Evidence Assessment.'
    : 'No API key for the AI proxy. Add one in Settings → System → AI Evidence Assessment.')
}

// ── Calling the model ───────────────────────────────────────────────────────

function resolveChatCompletionsUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions') || trimmed.endsWith('/responses')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`
  return `${trimmed}/v1/chat/completions`
}

function resolveModelsUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, '').replace(/\/(chat\/completions|responses)$/, '')
  return trimmed.endsWith('/v1') ? `${trimmed}/models` : `${trimmed}/v1/models`
}

function proxyError(status: number, body: string) {
  const detail = body.slice(0, 300)
  if (status === 401 || status === 403) return new AiProviderError(`The AI proxy rejected the API key (${status}): ${detail}`)
  return new AiProviderError(`AI proxy request failed (${status}): ${detail}`)
}

function anthropicMessage(error: any) {
  return error?.error?.error?.message || error?.message || 'Unknown error'
}

export function describeAiError(error: unknown, context: { model?: string, timeoutMs?: number } = {}) {
  const model = context.model || 'this model'
  const seconds = context.timeoutMs ? Math.round(context.timeoutMs / 1000) : null
  if (error instanceof AiProviderError) return error.message
  if (error instanceof Anthropic.AuthenticationError) return 'Anthropic rejected the API key (401). Save a valid key from console.anthropic.com in Settings.'
  if (error instanceof Anthropic.PermissionDeniedError) return `This API key is not allowed to use ${model} (403): ${anthropicMessage(error)}`
  if (error instanceof Anthropic.NotFoundError) return `${model} is not available to this API key (404). Pick another model in Settings.`
  if (error instanceof Anthropic.RateLimitError) return 'Anthropic rate limit reached (429). Wait a minute and try again.'
  if (error instanceof Anthropic.BadRequestError) return `Anthropic rejected the request (400): ${anthropicMessage(error)}`
  if (error instanceof Anthropic.InternalServerError) return `Anthropic is having trouble right now (${error.status}). Try again in a moment.`
  if (error instanceof Anthropic.APIUserAbortError || error instanceof Anthropic.APIConnectionTimeoutError) {
    return `${model} did not answer within ${seconds ?? 'the'} seconds. Raise the timeout in Settings or pick a faster model.`
  }
  if (error instanceof Anthropic.APIConnectionError) return 'Could not reach api.anthropic.com from the server.'
  if (error instanceof Anthropic.APIError) return `Anthropic error (${error.status}): ${anthropicMessage(error)}`
  if (error instanceof DOMException && error.name === 'TimeoutError') {
    return `The AI proxy did not answer within ${seconds ?? 'the'} seconds.`
  }
  return error instanceof Error ? error.message : 'Unknown AI error'
}

// True when Anthropic refused the request itself: 400 for a file it cannot open or a prompt over
// the context window, 413 for a request body over the size limit.
export function isRequestRejected(error: unknown) {
  return error instanceof Anthropic.BadRequestError || (error instanceof Anthropic.APIError && error.status === 413)
}

function claudeContent(options: GenerateJsonOptions) {
  if (!options.files?.length) return options.prompt
  const blocks: any[] = []
  options.files.forEach((file, index) => {
    blocks.push({ type: 'text', text: `Attachment ${index + 1}: ${file.name}` })
    blocks.push(file.kind === 'pdf'
      ? { type: 'document', source: { type: 'base64', media_type: file.mediaType, data: file.data }, title: file.name }
      : { type: 'image', source: { type: 'base64', media_type: file.mediaType, data: file.data } })
  })
  blocks.push({ type: 'text', text: options.prompt })
  return blocks
}

async function generateWithClaude(options: GenerateJsonOptions): Promise<GenerateJsonResult> {
  const client = new Anthropic({ apiKey: options.apiKey, timeout: options.timeoutMs, maxRetries: 1 })
  const body = {
    model: options.model,
    max_tokens: 16000,
    system: options.system,
    messages: [{ role: 'user' as const, content: claudeContent(options) }],
    output_config: { format: { type: 'json_schema' as const, schema: options.schema } },
  }
  // One deadline for the call and its retry, so the function answers before the browser gives up.
  const requestOptions = { signal: AbortSignal.timeout(options.timeoutMs) }

  const response: any = SERVER_FALLBACK_MODELS.has(options.model)
    ? await client.beta.messages.create(
      { ...body, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' } as any,
      requestOptions,
    )
    : await client.messages.create(body as any, requestOptions)

  if (response.stop_reason === 'refusal') {
    throw new AiProviderError(`${response.model} declined this request${response.stop_details?.explanation ? `: ${response.stop_details.explanation}` : '.'}`)
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AiProviderError(`${response.model} ran out of output tokens before finishing its answer.`)
  }

  const text = response.content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('')

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (_) {
    throw new AiProviderError(`${response.model} returned an answer that is not valid JSON.`)
  }

  return {
    parsed,
    raw: text,
    usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    model: response.model,
  }
}

async function generateWithProxy(options: GenerateJsonOptions): Promise<GenerateJsonResult> {
  if (!options.baseUrl) throw new AiProviderError('Missing AI proxy URL. Set it in Settings or the Supabase secret AI_PROXY_URL.')

  const payload: Record<string, unknown> = {
    model: options.model || undefined,
    vision: options.vision ?? true,
    messages: [
      { role: 'system', content: options.system },
      { role: 'user', content: options.prompt },
    ],
    temperature: options.temperature,
    response_format: { type: 'json_object' },
  }
  if (options.maxTokens) payload.max_tokens = options.maxTokens

  const response = await fetch(resolveChatCompletionsUrl(options.baseUrl), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(options.timeoutMs),
  })

  const responseText = await response.text()
  if (!response.ok) throw proxyError(response.status, responseText)

  let raw: unknown = responseText
  try { raw = JSON.parse(responseText) } catch (_) { /* SSE or fenced text; callers parse it */ }
  return { parsed: null, raw, usage: null, model: null }
}

export function generateJson(options: GenerateJsonOptions) {
  return options.provider === 'anthropic' ? generateWithClaude(options) : generateWithProxy(options)
}

export async function listModels(options: { provider: AiProvider, apiKey: string, baseUrl?: string }) {
  if (options.provider === 'anthropic') {
    const client = new Anthropic({ apiKey: options.apiKey, timeout: 15000, maxRetries: 1 })
    const models: { id: string, label: string }[] = []
    for await (const model of client.models.list({ limit: 100 })) {
      // Every request asks for JSON through structured outputs, so leave out models that can't.
      if ((model as any).capabilities?.structured_outputs?.supported === false) continue
      models.push({ id: model.id, label: model.display_name || model.id })
    }
    return models
  }

  if (!options.baseUrl) throw new AiProviderError('Set the proxy URL first.')
  const response = await fetch(resolveModelsUrl(options.baseUrl), {
    headers: { 'Authorization': `Bearer ${options.apiKey}` },
    signal: AbortSignal.timeout(15000),
  })
  const text = await response.text()
  if (!response.ok) throw proxyError(response.status, text)

  let body: any = null
  try { body = JSON.parse(text) } catch (_) { throw new AiProviderError('The proxy answered /models with something other than JSON.') }
  const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []
  return list
    .map((item: any) => String(item?.id || '').trim())
    .filter(Boolean)
    .map((id: string) => ({ id, label: id }))
}
