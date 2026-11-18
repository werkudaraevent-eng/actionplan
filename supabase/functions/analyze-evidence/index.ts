import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  describeAiError,
  generateJson,
  getAiConfig,
  resolveApiKey,
  resolveProvider,
  resolveProxyUrl,
  resolveTimeoutMs,
} from '../_shared/ai.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PROMPT_VERSION = 'v1'
const EVIDENCE_BUCKET = 'evidence-attachments'
const MAX_ATTACHMENTS = 3
const MAX_TEXT_CHARS_PER_FILE = 20000
const TEXT_MIME_PREFIXES = ['text/']
const TEXT_MIME_TYPES = new Set([
  'application/json',
  'application/xml',
  'application/csv',
  'text/csv',
])

type Attachment = {
  type?: string
  name?: string
  title?: string
  url?: string
  storage_path?: string
  path?: string
  size?: number
  mime?: string
}

type AnalysisResult = {
  summary?: string
  evidence_match_score?: number
  recommended_score_min?: number
  recommended_score_max?: number
  recommended_verdict?: string
  missing_evidence?: string[]
  risks_or_inconsistencies?: string[]
  follow_up_questions?: string[]
  confidence?: string
  limitations?: string[]
  rationale?: string
}

const VERDICTS = ['approve', 'revision', 'carry_over', 'fail']
const stringList = { type: 'array', items: { type: 'string' } }

// The keys buildPrompt asks for, enforced through structured outputs on the Anthropic path.
// Ranges live in descriptions because structured outputs reject numeric bounds; clampScore applies them.
const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    evidence_match_score: { type: 'integer', description: '0 to 100' },
    recommended_score_min: { type: 'integer', description: '0 to 100' },
    recommended_score_max: { type: 'integer', description: '0 to 100, not below recommended_score_min' },
    recommended_verdict: { type: 'string', enum: VERDICTS },
    missing_evidence: stringList,
    risks_or_inconsistencies: stringList,
    follow_up_questions: stringList,
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    limitations: stringList,
    rationale: { type: 'string' },
  },
  required: [
    'summary', 'evidence_match_score', 'recommended_score_min', 'recommended_score_max', 'recommended_verdict',
    'missing_evidence', 'risks_or_inconsistencies', 'follow_up_questions', 'confidence', 'limitations', 'rationale',
  ],
  additionalProperties: false,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function estimateTokens(value: unknown) {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return Math.ceil((text || '').length / 4)
}

function clampScore(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

function normalizeVerdict(value: unknown) {
  const verdict = String(value || '').toLowerCase().trim()
  if (VERDICTS.includes(verdict)) return verdict
  if (verdict === 'approved' || verdict === 'achieved') return 'approve'
  if (verdict === 'revise' || verdict === 'request_revision') return 'revision'
  if (verdict === 'carryover' || verdict === 'carry-over') return 'carry_over'
  if (verdict === 'failed' || verdict === 'drop' || verdict === 'dropped') return 'fail'
  return null
}

function normalizeConfidence(value: unknown) {
  const confidence = String(value || '').toLowerCase().trim()
  return ['high', 'medium', 'low'].includes(confidence) ? confidence : null
}

async function sha256Hex(input: string) {
  const bytes = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function isTextLike(mime?: string, name?: string) {
  const lowerMime = (mime || '').toLowerCase()
  const lowerName = (name || '').toLowerCase()
  return TEXT_MIME_PREFIXES.some((prefix) => lowerMime.startsWith(prefix))
    || TEXT_MIME_TYPES.has(lowerMime)
    || ['.txt', '.csv', '.json', '.md', '.log'].some((ext) => lowerName.endsWith(ext))
}


function getStoragePath(item: Attachment) {
  if (item.storage_path || item.path) return item.storage_path || item.path
  if (!item.url) return null
  const marker = `/object/public/${EVIDENCE_BUCKET}/`
  const idx = item.url.indexOf(marker)
  if (idx === -1) return null
  return decodeURIComponent(item.url.substring(idx + marker.length))
}

async function readTextAttachment(supabaseAdmin: ReturnType<typeof createClient>, item: Attachment) {
  const storagePath = getStoragePath(item)
  const meta = {
    type: item.type || 'unknown',
    name: item.name || item.title || item.url || 'Untitled attachment',
    mime: item.mime || null,
    size: item.size || null,
    url: item.type === 'link' ? item.url : null,
    storage_path: storagePath,
  }

  if (item.type === 'link') {
    return { ...meta, extracted_text: null, limitation: 'External link content was not fetched; only URL/title metadata was analyzed.' }
  }

  if (!storagePath) {
    return { ...meta, extracted_text: null, limitation: 'Uploaded file has no resolvable storage path.' }
  }

  if (!isTextLike(item.mime, item.name)) {
    const { data } = await supabaseAdmin.storage.from(EVIDENCE_BUCKET).createSignedUrl(storagePath, 60 * 15)
    return {
      ...meta,
      signed_url: data?.signedUrl || null,
      extracted_text: null,
      limitation: 'Binary document content was provided as metadata/signed URL only. Full content analysis depends on 9router model URL/file support.',
    }
  }

  try {
    const { data, error } = await supabaseAdmin.storage.from(EVIDENCE_BUCKET).download(storagePath)
    if (error || !data) {
      return { ...meta, extracted_text: null, limitation: `File could not be downloaded: ${error?.message || 'Unknown error'}` }
    }

    const text = await data.text()
    return {
      ...meta,
      extracted_text: text.slice(0, MAX_TEXT_CHARS_PER_FILE),
      truncated: text.length > MAX_TEXT_CHARS_PER_FILE,
    }
  } catch (error) {
    return {
      ...meta,
      extracted_text: null,
      limitation: `Text extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    }
  }
}

function buildPrompt(snapshot: Record<string, unknown>) {
  return [
    'You are an evidence assessment assistant for corporate action plan grading.',
    'Compare target evidence requirements with submitted evidence. Be strict, practical, and concise.',
    'Return JSON only with keys: summary, evidence_match_score, recommended_score_min, recommended_score_max, recommended_verdict, missing_evidence, risks_or_inconsistencies, follow_up_questions, confidence, limitations, rationale.',
    'recommended_verdict must be one of: approve, revision, carry_over, fail.',
    'AI is advisory only; do not claim authenticity certainty.',
    '',
    'Evidence snapshot:',
    JSON.stringify(snapshot, null, 2),
  ].join('\n')
}

function extractJsonFromText(text: string) {
  try {
    return JSON.parse(text)
  } catch (_) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
    const source = fenced?.[1] || text
    const match = source.match(/\{[\s\S]*\}/)
    if (!match) return null
    try {
      return JSON.parse(match[0])
    } catch (_) {
      return null
    }
  }
}

function parseSseChatCompletion(text: string) {
  if (!text.includes('data:')) return null

  let content = ''
  let usage = null
  let model = null

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) continue

    const payload = trimmed.slice(5).trim()
    if (!payload || payload === '[DONE]') continue

    try {
      const chunk = JSON.parse(payload)
      model = chunk.model || model
      const delta = chunk.choices?.[0]?.delta?.content
      const message = chunk.choices?.[0]?.message?.content
      if (typeof delta === 'string') content += delta
      if (typeof message === 'string') content += message
      if (chunk.usage) usage = chunk.usage
    } catch (_) {
      continue
    }
  }

  if (!content) return null
  return { content, usage, model }
}

function normalizeProviderResult(providerResponse: any): { result: AnalysisResult, outputText: string, usage: any, model?: string } {
  if (typeof providerResponse === 'string') {
    const stream = parseSseChatCompletion(providerResponse)
    if (stream) {
      const parsed = extractJsonFromText(stream.content)
      if (parsed) return { result: parsed, outputText: stream.content, usage: stream.usage, model: stream.model }
    }
  }

  const usage = providerResponse?.usage || providerResponse?.data?.usage || null
  const candidates = [
    providerResponse?.analysis_result,
    providerResponse?.result,
    providerResponse?.data?.result,
    providerResponse?.data?.analysis_result,
    providerResponse?.choices?.[0]?.message?.content,
    providerResponse?.choices?.[0]?.text,
    providerResponse?.content?.[0]?.text,
    providerResponse?.message,
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (typeof candidate === 'object') {
      return { result: candidate, outputText: JSON.stringify(candidate), usage, model: providerResponse?.model }
    }
    if (typeof candidate === 'string') {
      const parsed = extractJsonFromText(candidate)
      if (parsed) return { result: parsed, outputText: candidate, usage, model: providerResponse?.model }
    }
  }

  return {
    result: {
      summary: 'AI response could not be parsed into the expected JSON schema.',
      confidence: 'low',
      limitations: ['Provider response format was not recognized.'],
      rationale: typeof providerResponse === 'string' ? providerResponse : JSON.stringify(providerResponse).slice(0, 1000),
    },
    outputText: typeof providerResponse === 'string' ? providerResponse : JSON.stringify(providerResponse),
    usage,
    model: providerResponse?.model,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const envAiModel = Deno.env.get('AI_MODEL_FAST') || Deno.env.get('NINEROUTER_MODEL') || ''
    const envTimeoutMs = Number(Deno.env.get('AI_TIMEOUT_MS') || '60000')

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
    const isAdmin = ['admin', 'administrator', 'holding_admin'].includes(role)
    if (!isAdmin) throw new Error(`Forbidden: Role '${profile.role}' cannot analyze evidence`)

    const { actionPlanId, force = false } = await req.json()
    if (!actionPlanId) throw new Error('actionPlanId is required')

    let planQuery = supabaseAdmin
      .from('action_plans')
      .select('*')
      .eq('id', actionPlanId)
      .single()

    const { data: plan, error: planError } = await planQuery
    if (planError || !plan) throw new Error('Action plan not found')
    if (role !== 'holding_admin' && plan.company_id && profile.company_id !== plan.company_id) {
      throw new Error('Forbidden: action plan belongs to another company')
    }

    const companyId = plan.company_id || profile.company_id || null
    const aiConfig = await getAiConfig(supabaseAdmin, companyId)
    if (aiConfig.enabled === false) throw new Error('AI evidence assessment is disabled in system settings')

    const provider = resolveProvider(aiConfig)
    // The AI_MODEL_FAST secret names a proxy model, so Claude only takes the model picked in Settings.
    const aiModel = String(aiConfig.model_fast || (provider === 'anthropic' ? '' : envAiModel) || '').trim()
    const timeoutMs = resolveTimeoutMs(aiConfig.timeout_ms, envTimeoutMs || 60000)
    const aiUrl = provider === 'anthropic' ? undefined : resolveProxyUrl(aiConfig.proxy_url)

    if (provider === 'anthropic' && !aiModel) throw new Error('Pick a Fast Model in Settings → System → AI Evidence Assessment')
    if (provider !== 'anthropic' && !aiUrl) throw new Error('Missing AI proxy URL. Configure it in Settings or Supabase secret AI_PROXY_URL')
    const aiKey = await resolveApiKey(companyId, provider)

    const attachments = Array.isArray(plan.attachments) ? plan.attachments.slice(0, MAX_ATTACHMENTS) : []
    const analyzedAttachments = []
    for (const item of attachments) {
      try {
        analyzedAttachments.push(await readTextAttachment(supabaseAdmin, item))
      } catch (error) {
        analyzedAttachments.push({
          type: item?.type || 'unknown',
          name: item?.name || item?.title || item?.url || 'Untitled attachment',
          mime: item?.mime || null,
          size: item?.size || null,
          extracted_text: null,
          limitation: `Attachment could not be processed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        })
      }
    }

    const attachmentLimitations = Array.isArray(plan.attachments) && plan.attachments.length > MAX_ATTACHMENTS
      ? [`Only first ${MAX_ATTACHMENTS} attachments were included to control token usage.`]
      : []

    const snapshot = {
      plan: {
        id: plan.id,
        department_code: plan.department_code,
        month: plan.month,
        year: plan.year,
        category: plan.category,
        area_focus: plan.area_focus,
        goal_strategy: plan.goal_strategy,
        action_plan: plan.action_plan,
        indicator: plan.indicator,
        target_evidence: plan.evidence,
      },
      submission: {
        outcome_link: plan.outcome_link,
        remark: plan.remark,
        attachments: analyzedAttachments,
        limitations: attachmentLimitations,
      },
    }

    const inputHash = await sha256Hex(JSON.stringify({ snapshot, promptVersion: PROMPT_VERSION }))

    if (!force) {
      const { data: cached } = await supabaseAdmin
        .from('ai_assessments')
        .select('*')
        .eq('action_plan_id', actionPlanId)
        .eq('input_hash', inputHash)
        .eq('prompt_version', PROMPT_VERSION)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cached) return jsonResponse({ assessment: cached, cached: true })
    }

    const prompt = buildPrompt(snapshot)
    const estimatedInputTokens = estimateTokens(prompt)

    let generated
    try {
      generated = await generateJson({
        provider,
        apiKey: aiKey,
        baseUrl: aiUrl,
        model: aiModel,
        system: 'Return valid JSON only. No markdown.',
        prompt,
        schema: ANALYSIS_SCHEMA,
        timeoutMs,
        vision: aiConfig.vision ?? true,
        temperature: 0.2,
      })
    } catch (error) {
      throw new Error(describeAiError(error, { model: aiModel, timeoutMs }))
    }

    const providerResponse: any = typeof generated.raw === 'string'
      ? extractJsonFromText(generated.raw) || generated.raw
      : generated.raw
    const { result, outputText, usage, model: providerModel } = generated.parsed
      ? { result: generated.parsed as AnalysisResult, outputText: String(generated.raw), usage: generated.usage, model: generated.model || undefined }
      : normalizeProviderResult(providerResponse)
    const normalizedResult = {
      summary: result.summary || 'No summary provided.',
      evidence_match_score: clampScore(result.evidence_match_score),
      recommended_score_min: clampScore(result.recommended_score_min),
      recommended_score_max: clampScore(result.recommended_score_max),
      recommended_verdict: normalizeVerdict(result.recommended_verdict),
      missing_evidence: Array.isArray(result.missing_evidence) ? result.missing_evidence : [],
      risks_or_inconsistencies: Array.isArray(result.risks_or_inconsistencies) ? result.risks_or_inconsistencies : [],
      follow_up_questions: Array.isArray(result.follow_up_questions) ? result.follow_up_questions : [],
      confidence: normalizeConfidence(result.confidence) || 'low',
      limitations: Array.isArray(result.limitations) ? [...result.limitations, ...attachmentLimitations] : attachmentLimitations,
      rationale: result.rationale || '',
    }

    const exactInput = usage?.input_tokens ?? usage?.prompt_tokens ?? null
    const exactOutput = usage?.output_tokens ?? usage?.completion_tokens ?? null
    const outputEstimate = estimateTokens(outputText)
    const inputTokens = exactInput ?? estimatedInputTokens
    const outputTokens = exactOutput ?? outputEstimate
    const totalTokens = usage?.total_tokens ?? (inputTokens + outputTokens)
    const isEstimate = exactInput == null || exactOutput == null

    const insertPayload = {
      action_plan_id: plan.id,
      company_id: plan.company_id,
      requested_by: user.id,
      provider: provider === 'anthropic' ? 'anthropic' : '9router',
      model: aiModel || providerModel || providerResponse?.model || null,
      prompt_version: PROMPT_VERSION,
      input_hash: inputHash,
      evidence_snapshot: snapshot,
      analysis_result: normalizedResult,
      summary: normalizedResult.summary,
      recommended_score_min: normalizedResult.recommended_score_min,
      recommended_score_max: normalizedResult.recommended_score_max,
      recommended_verdict: normalizedResult.recommended_verdict,
      confidence: normalizedResult.confidence,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_tokens: estimatedInputTokens + outputEstimate,
      is_estimate: isEstimate,
    }

    const { data: assessment, error: insertError } = await supabaseAdmin
      .from('ai_assessments')
      .insert(insertPayload)
      .select('*')
      .single()

    if (insertError) throw insertError

    return jsonResponse({ assessment, cached: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message.startsWith('Forbidden') ? 403 : 400
    return jsonResponse({ error: message }, status)
  }
})
