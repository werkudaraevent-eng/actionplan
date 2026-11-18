import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  deleteStoredKey,
  describeAiError,
  generateJson,
  getAiConfig,
  getKeyStatus,
  listModels,
  parseProvider,
  resolveApiKey,
  resolveProxyUrl,
  resolveTimeoutMs,
  saveStoredKey,
} from '../_shared/ai.ts'
import {
  disconnectOneDrive,
  getGraphToken,
  getOneDriveStatus,
  getSharedItem,
  isOneDriveLink,
  OneDriveError,
  pollOneDriveLogin,
  startOneDriveLogin,
} from '../_shared/onedrive.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ADMIN_ROLES = ['admin', 'administrator', 'holding_admin']
const MAX_KEY_LENGTH = 512

const TEST_SCHEMA = {
  type: 'object',
  properties: { status: { type: 'string', enum: ['ok'] } },
  required: ['status'],
  additionalProperties: false,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Admin-only backend for the AI card in Settings: saves the API key to Vault, lists the models
// that key can use, and runs a one-line test call. The key itself never comes back to the browser.
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase environment variables')

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const token = authHeader.replace('Bearer ', '')
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) throw new Error('Invalid or expired token')

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, company_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) throw new Error('User profile not found')

    const role = String(profile.role || '').toLowerCase()
    if (!ADMIN_ROLES.includes(role)) throw new Error(`Forbidden: Role '${profile.role}' cannot manage AI settings`)

    const body = await req.json()
    const action = String(body.action || '')
    const companyId = String(body.company_id || profile.company_id || '')
    if (!companyId) throw new Error('company_id is required')
    if (role !== 'holding_admin' && profile.company_id !== companyId) {
      throw new Error('Forbidden: these settings belong to another company')
    }

    if (action === 'status') {
      const [keys, onedrive] = await Promise.all([getKeyStatus(companyId), getOneDriveStatus(companyId)])
      return jsonResponse({ ...keys, onedrive })
    }

    // ── OneDrive reader account (Microsoft device code sign-in) ──
    if (action === 'onedrive_connect') {
      return jsonResponse(await startOneDriveLogin(companyId, String(body.client_id || '').trim()))
    }
    if (action === 'onedrive_poll') {
      const result = await pollOneDriveLogin(companyId, user.id)
      return jsonResponse({ ...result, onedrive: await getOneDriveStatus(companyId) })
    }
    if (action === 'onedrive_disconnect') {
      await disconnectOneDrive(companyId)
      return jsonResponse({ onedrive: await getOneDriveStatus(companyId) })
    }
    if (action === 'onedrive_test') {
      // Like list_models, a failure here is an answer for the admin, so it comes back as 200.
      const url = String(body.url || '').trim()
      if (!isOneDriveLink(url)) return jsonResponse({ ok: false, error: 'Paste a OneDrive link (1drv.ms or onedrive.live.com).' })
      try {
        const item = await getSharedItem(await getGraphToken(companyId), url, AbortSignal.timeout(20000))
        return jsonResponse({ ok: true, name: item.name, is_folder: item.isFolder, size: item.size, child_count: item.childCount })
      } catch (error) {
        const message = error instanceof OneDriveError ? error.message : `OneDrive could not be reached: ${error instanceof Error ? error.message : 'unknown error'}`
        return jsonResponse({ ok: false, error: message })
      }
    }

    const provider = parseProvider(body.provider)

    if (action === 'save_key') {
      const apiKey = String(body.api_key || '').trim()
      if (!apiKey) throw new Error('API key is empty')
      if (apiKey.length > MAX_KEY_LENGTH || /\s/.test(apiKey)) throw new Error('That does not look like an API key')
      await saveStoredKey(companyId, provider, apiKey, user.id)
      return jsonResponse(await getKeyStatus(companyId))
    }

    if (action === 'delete_key') {
      await deleteStoredKey(companyId, provider)
      return jsonResponse(await getKeyStatus(companyId))
    }

    // list_models and test may run on a key the admin pasted but has not saved yet. Their
    // failures are answers for the admin, so they come back as 200 with an error message.
    const config = await getAiConfig(supabaseAdmin, companyId)
    const draftKey = String(body.api_key || '').trim()
    const baseUrl = provider === 'openai_compatible' ? resolveProxyUrl(body.base_url ?? config.proxy_url) : undefined

    if (action === 'list_models') {
      try {
        const apiKey = draftKey || await resolveApiKey(companyId, provider)
        return jsonResponse({ models: await listModels({ provider, apiKey, baseUrl }) })
      } catch (error) {
        return jsonResponse({ models: [], error: describeAiError(error) })
      }
    }

    if (action === 'test') {
      const model = String(body.model || '').trim()
      if (!model && provider === 'anthropic') throw new Error('Pick a model to test')
      const timeoutMs = resolveTimeoutMs(body.timeout_ms ?? config.timeout_ms, 60000)
      const startedAt = Date.now()
      try {
        const apiKey = draftKey || await resolveApiKey(companyId, provider)
        const result = await generateJson({
          provider,
          apiKey,
          baseUrl,
          model,
          system: 'You are answering a connectivity check.',
          prompt: 'Reply with status "ok" as JSON: {"status": "ok"}.',
          schema: TEST_SCHEMA,
          timeoutMs,
          vision: body.vision ?? config.vision ?? true,
          temperature: 0,
          maxTokens: 50,
        })
        return jsonResponse({
          ok: true,
          model: result.model || model || null,
          latency_ms: Date.now() - startedAt,
          usage: result.usage,
        })
      } catch (error) {
        return jsonResponse({ ok: false, model: model || null, error: describeAiError(error, { model, timeoutMs }) })
      }
    }

    throw new Error(`Unknown action: '${action}'`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message.startsWith('Forbidden') ? 403 : 400
    return jsonResponse({ error: message }, status)
  }
})
