import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type AiConfig = {
  enabled?: boolean
  proxy_url?: string | null
  model_fast?: string | null
  timeout_ms?: number | string | null
  vision?: boolean
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function resolveChatCompletionsUrl(baseUrl: string) {
  const trimmed = baseUrl.replace(/\/+$/, '')
  if (trimmed.endsWith('/chat/completions') || trimmed.endsWith('/responses')) return trimmed
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`
  return `${trimmed}/v1/chat/completions`
}

function resolveTimeoutMs(value: unknown, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(5000, Math.min(300000, parsed))
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

async function getAiConfig(supabaseAdmin: ReturnType<typeof createClient>, companyId: string | null): Promise<AiConfig> {
  if (!companyId) return {}

  const { data } = await supabaseAdmin
    .from('system_settings')
    .select('ai_config')
    .eq('company_id', companyId)
    .maybeSingle()

  return data?.ai_config || {}
}

function normalizeInsight(value: any, fallback = 'No AI insight available for this slide.') {
  return {
    diagnosis: String(value?.diagnosis || fallback),
    implication: String(value?.implication || 'Management should review this signal against monthly priorities.'),
    decision_needed: String(value?.decision_needed || 'Decide whether escalation, resource support, or monitoring is required.'),
    recommended_action: String(value?.recommended_action || 'Assign owner follow-up and review progress in next operating meeting.'),
  }
}

function normalizeReport(providerResponse: any) {
  let source = providerResponse
  if (typeof providerResponse === 'string') {
    const stream = parseSseChatCompletion(providerResponse)
    source = stream ? extractJsonFromText(stream.content) : extractJsonFromText(providerResponse)
  }

  const candidate = source?.choices?.[0]?.message?.content || source?.choices?.[0]?.text || source?.report || source
  const parsed = typeof candidate === 'string' ? extractJsonFromText(candidate) : candidate
  const slides = parsed?.slides || {}
  const legacySummary = parsed?.summary || 'AI narrative could not be parsed. Review deterministic report sections.'
  const legacyFindings = Array.isArray(parsed?.key_findings) ? parsed.key_findings : []
  const legacyRisks = Array.isArray(parsed?.risks) ? parsed.risks : []
  const legacyRecommendations = Array.isArray(parsed?.recommendations) ? parsed.recommendations : []
  const legacyActions = Array.isArray(parsed?.executive_actions) ? parsed.executive_actions : []

  return {
    summary: legacySummary,
    key_findings: legacyFindings,
    risks: legacyRisks,
    recommendations: legacyRecommendations,
    executive_actions: legacyActions,
    executive_memo: {
      summary: String(parsed?.executive_memo?.summary || legacySummary),
      top_decisions: Array.isArray(parsed?.executive_memo?.top_decisions) ? parsed.executive_memo.top_decisions : legacyActions,
      board_questions: Array.isArray(parsed?.executive_memo?.board_questions) ? parsed.executive_memo.board_questions : legacyRecommendations,
    },
    slides: {
      executive_summary: normalizeInsight(slides.executive_summary, legacyFindings[0] || legacySummary),
      kpi_snapshot: normalizeInsight(slides.kpi_snapshot, legacyFindings[1] || legacySummary),
      department_performance: normalizeInsight(slides.department_performance, legacyFindings[2] || legacySummary),
      risk_bottleneck: normalizeInsight(slides.risk_bottleneck, legacyRisks[0] || legacySummary),
      evidence_quality: normalizeInsight(slides.evidence_quality, legacyRisks[1] || legacySummary),
      carry_over_revision: normalizeInsight(slides.carry_over_revision, legacyRisks[2] || legacySummary),
      action_agenda: normalizeInsight(slides.action_agenda, legacyActions[0] || legacySummary),
    },
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const envAiUrl = Deno.env.get('AI_PROXY_URL') || Deno.env.get('NINEROUTER_API_URL') || ''
    const aiKey = Deno.env.get('AI_PROXY_KEY') || Deno.env.get('NINEROUTER_API_KEY') || ''
    const envAiModel = Deno.env.get('AI_MODEL_FAST') || Deno.env.get('NINEROUTER_MODEL') || ''
    const envTimeoutMs = Number(Deno.env.get('AI_TIMEOUT_MS') || '60000')

    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase environment variables')
    if (!aiKey) throw new Error('Missing AI_PROXY_KEY or NINEROUTER_API_KEY Supabase secret')

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
    const allowed = ['admin', 'administrator', 'holding_admin', 'executive'].includes(role)
    if (!allowed) throw new Error(`Forbidden: Role '${profile.role}' cannot generate executive report narrative`)

    const payload = await req.json()
    const companyId = payload.company_id || profile.company_id || null
    if (role !== 'holding_admin' && companyId && profile.company_id !== companyId) {
      throw new Error('Forbidden: report belongs to another company')
    }

    const aiConfig = await getAiConfig(supabaseAdmin, companyId)
    if (aiConfig.enabled === false) throw new Error('AI report narrative is disabled in system settings')

    const aiUrl = String(aiConfig.proxy_url || envAiUrl || '').trim()
    const aiModel = String(aiConfig.model_fast || envAiModel || '').trim()
    const timeoutMs = resolveTimeoutMs(aiConfig.timeout_ms, envTimeoutMs || 60000)
    const aiVision = aiConfig.vision ?? true

    if (!aiUrl) throw new Error('Missing AI proxy URL. Configure it in Settings or Supabase secret AI_PROXY_URL')

    const prompt = [
      'You are a management consultant preparing a monthly corporate action-plan decision deck.',
      'Use aggregate metrics only. Identify operational patterns, separate signal from noise, and translate every slide into decisions.',
      'Do not invent facts beyond the payload. If evidence is weak, say what management should verify.',
      'Return JSON only with this exact shape:',
      '{',
      '  "executive_memo": { "summary": "string", "top_decisions": ["string"], "board_questions": ["string"] },',
      '  "slides": {',
      '    "executive_summary": { "diagnosis": "string", "implication": "string", "decision_needed": "string", "recommended_action": "string" },',
      '    "kpi_snapshot": { "diagnosis": "string", "implication": "string", "decision_needed": "string", "recommended_action": "string" },',
      '    "department_performance": { "diagnosis": "string", "implication": "string", "decision_needed": "string", "recommended_action": "string" },',
      '    "risk_bottleneck": { "diagnosis": "string", "implication": "string", "decision_needed": "string", "recommended_action": "string" },',
      '    "evidence_quality": { "diagnosis": "string", "implication": "string", "decision_needed": "string", "recommended_action": "string" },',
      '    "carry_over_revision": { "diagnosis": "string", "implication": "string", "decision_needed": "string", "recommended_action": "string" },',
      '    "action_agenda": { "diagnosis": "string", "implication": "string", "decision_needed": "string", "recommended_action": "string" }',
      '  }',
      '}',
      'Keep each insight concise: diagnosis 1 sentence, implication 1 sentence, decision_needed 1 sentence, recommended_action 1 sentence.',
      '',
      'Monthly report payload:',
      JSON.stringify(payload, null, 2),
    ].join('\n')

    const providerPayload = {
      model: aiModel || undefined,
      vision: aiVision,
      messages: [
        { role: 'system', content: 'Return valid JSON only. No markdown.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const aiResponse = await fetch(resolveChatCompletionsUrl(aiUrl), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${aiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(providerPayload),
        signal: controller.signal,
      })

      const responseText = await aiResponse.text()
      if (!aiResponse.ok) {
        throw new Error(`9router request failed (${aiResponse.status}): ${responseText.slice(0, 500)}`)
      }

      const providerResponse = extractJsonFromText(responseText) || responseText
      return jsonResponse({ report: normalizeReport(providerResponse) })
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message.startsWith('Forbidden') ? 403 : 400
    return jsonResponse({ error: message }, status)
  }
})
