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

// The shape buildTopicPrompt asks for, enforced through structured outputs on the Anthropic path.
const TOPIC_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    narrative: { type: 'array', items: { type: 'string' } },
    highlights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          value: { type: 'string' },
          tone: { type: 'string', enum: ['positive', 'negative', 'warning', 'neutral'] },
        },
        required: ['label', 'value', 'tone'],
        additionalProperties: false,
      },
    },
  },
  required: ['headline', 'narrative', 'highlights'],
  additionalProperties: false,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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

const TOPIC_CONFIG: Record<string, { title: string; focus: string }> = {
  executive_summary: {
    title: 'Executive Summary',
    focus: [
      'Deliver the single most important takeaway for leadership this month.',
      'Synthesize completion, verification quality, risk posture, and trajectory into one clear verdict: on-track, at-risk, or off-track — and justify it with the numbers.',
      'Name the biggest win and the biggest problem of the month specifically.',
    ].join(' '),
  },
  performance_trend: {
    title: 'Performance & Trend',
    focus: [
      'Analyze completion rate against target and against the previous period.',
      'Explain the trajectory (improving / flat / declining) and what is driving it.',
      'Quantify the gap to target in points and say what closing it would require.',
      'If previous-period data is unavailable, say so and skip trend claims. If target is unavailable, skip target comparison.',
    ].join(' '),
  },
  department_spotlight: {
    title: 'Department Spotlight',
    focus: [
      'Compare departments against each other, not just against the average.',
      'Name the top and bottom performers explicitly and explain what each is doing differently, referencing their specific plans/initiatives when provided.',
      'Identify any department that is dragging the company result and what it would take to recover.',
    ].join(' '),
  },
  priority_calibration: {
    title: 'Priority Calibration',
    focus: [
      'Evaluate whether execution effort matches stated priority.',
      'If Ultra High completion trails High or Medium, call out the calibration problem explicitly — the team may be clearing easy wins while critical work slips.',
      'Recommend how to re-sequence effort.',
    ].join(' '),
  },
  failure_risk: {
    title: 'Failure & Risk',
    focus: [
      'Diagnose why plans failed or stalled this period.',
      'Reference the specific at-risk plans by title, their blockers, owners (PIC), and how many cycles they have carried over when provided.',
      'Group recurring blocker patterns. If more than 30% of failure reasons are Unspecified, flag it as a data blind spot that hides real risk.',
    ].join(' '),
  },
  decision_agenda: {
    title: 'Decision Agenda',
    focus: [
      'Produce the concrete decisions leadership must make next, ordered by impact.',
      'Every recommendation must name WHAT to do, WHO owns it (use the PIC or department when provided), and a BY-WHEN deadline.',
      'Do not restate metrics — convert them into commitments.',
    ].join(' '),
  },
}

const systemPrompt = [
  'You are a senior executive performance analyst for Werkudara Group preparing one slide of a monthly board deck.',
  'You write sharp, decision-ready analysis for a CEO and department heads. Every sentence must earn its place.',
  'STRICT RULES:',
  '- Be specific. Reference actual departments, plans, owners, and numbers from the supplied data. Never write vague filler like "needs management attention" or "should be monitored".',
  '- Always interpret completion rate AND verification score together — high completion with low score is a quality problem, not a win.',
  '- Use ONLY the supplied data. Never invent plans, names, departments, targets, or trends. If data for a comparison is missing, say so plainly and move on.',
  '- Write for executives: lead with the implication, then the evidence. No hedging, no restating the obvious.',
  'Return valid JSON only. No markdown, no prose outside the JSON object.',
].join('\n')

function buildTopicPrompt(topic: string, payload: any) {
  const cfg = TOPIC_CONFIG[topic]
  const period = payload?.period?.label || `${payload?.period?.month || '-'} ${payload?.period?.year || ''}`.trim()
  const department = payload?.department_filter || 'All Departments'
  const data = payload?.data || {}

  return [
    `SLIDE TOPIC: ${cfg.title}`,
    `PERIOD: ${period}`,
    `SCOPE: ${department}`,
    '',
    'YOUR FOCUS FOR THIS SLIDE:',
    cfg.focus,
    '',
    'DATA FOR THIS SLIDE (use only this — do not invent beyond it):',
    JSON.stringify(data, null, 2),
    '',
    'Return JSON only with this exact schema:',
    '{',
    '  "headline": "one punchy executive sentence — the takeaway of this slide",',
    '  "narrative": ["2 to 4 concise analytical points; each is a full sentence that states an implication backed by a specific number or name"],',
    '  "highlights": [',
    '    { "label": "short metric name", "value": "the number/string to spotlight", "tone": "positive | negative | warning | neutral" }',
    '  ]',
    '}',
    'Provide 2 to 4 highlights — the numbers most worth spotlighting on this slide. Choose tone based on whether the number is good (positive), bad (negative), needs watching (warning), or informational (neutral).',
  ].join('\n')
}

function normalizeTopicResult(topic: string, providerResponse: any) {
  let source = providerResponse
  if (typeof providerResponse === 'string') {
    const stream = parseSseChatCompletion(providerResponse)
    source = stream ? extractJsonFromText(stream.content) : extractJsonFromText(providerResponse)
  }

  const candidate = source?.choices?.[0]?.message?.content || source?.choices?.[0]?.text || source
  const parsed = typeof candidate === 'string' ? extractJsonFromText(candidate) : candidate

  const narrative = Array.isArray(parsed?.narrative)
    ? parsed.narrative.map((item: any) => String(item)).filter(Boolean)
    : (typeof parsed?.narrative === 'string' && parsed.narrative.trim() ? [parsed.narrative.trim()] : [])

  const highlights = Array.isArray(parsed?.highlights)
    ? parsed.highlights
        .map((h: any) => ({
          label: String(h?.label || '').trim(),
          value: String(h?.value ?? '').trim(),
          tone: ['positive', 'negative', 'warning', 'neutral'].includes(h?.tone) ? h.tone : 'neutral',
        }))
        .filter((h: any) => h.label && h.value)
    : []

  return {
    topic,
    title: TOPIC_CONFIG[topic]?.title || topic,
    headline: String(parsed?.headline || '').trim() || 'AI analysis could not be parsed for this slide.',
    narrative,
    highlights,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const envAiModel = Deno.env.get('AI_MODEL_REASONING') || Deno.env.get('AI_MODEL_FAST') || Deno.env.get('NINEROUTER_MODEL') || ''
    const envTimeoutMs = Number(Deno.env.get('AI_TIMEOUT_MS') || '90000')

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
    const allowed = ['admin', 'administrator', 'holding_admin', 'executive'].includes(role)
    if (!allowed) throw new Error(`Forbidden: Role '${profile.role}' cannot generate executive report narrative`)

    const payload = await req.json()
    const topic = String(payload.topic || '').trim()
    if (!TOPIC_CONFIG[topic]) throw new Error(`Unknown report topic: '${topic}'`)

    const companyId = payload.company_id || profile.company_id || null
    if (role !== 'holding_admin' && companyId && profile.company_id !== companyId) {
      throw new Error('Forbidden: report belongs to another company')
    }

    const aiConfig = await getAiConfig(supabaseAdmin, companyId)
    if (aiConfig.enabled === false) throw new Error('AI report narrative is disabled in system settings')

    const provider = resolveProvider(aiConfig)
    // The AI_MODEL_* secrets name proxy models, so Claude only takes the models picked in Settings.
    const aiModel = String(aiConfig.model_reasoning || aiConfig.model_fast || (provider === 'anthropic' ? '' : envAiModel) || '').trim()
    const timeoutMs = resolveTimeoutMs(aiConfig.timeout_ms, envTimeoutMs || 90000)
    const aiUrl = provider === 'anthropic' ? undefined : resolveProxyUrl(aiConfig.proxy_url)

    if (provider === 'anthropic' && !aiModel) throw new Error('Pick a Reasoning Model in Settings → System → AI Evidence Assessment')
    if (provider !== 'anthropic' && !aiUrl) throw new Error('Missing AI proxy URL. Configure it in Settings or Supabase secret AI_PROXY_URL')
    const aiKey = await resolveApiKey(companyId, provider)

    const prompt = buildTopicPrompt(topic, payload)

    let generated
    try {
      generated = await generateJson({
        provider,
        apiKey: aiKey,
        baseUrl: aiUrl,
        model: aiModel,
        system: systemPrompt,
        prompt,
        schema: TOPIC_SCHEMA,
        timeoutMs,
        vision: aiConfig.vision ?? true,
        temperature: 0.3,
        maxTokens: 1200,
      })
    } catch (error) {
      throw new Error(describeAiError(error, { model: aiModel, timeoutMs }))
    }

    const providerResponse = generated.parsed
      ?? (typeof generated.raw === 'string' ? extractJsonFromText(generated.raw) || generated.raw : generated.raw)
    const result = normalizeTopicResult(topic, providerResponse)

    // Persist so completed slides survive page navigation and reloads.
    if (companyId) {
      await supabaseAdmin
        .from('executive_report_insights')
        .upsert({
          company_id: companyId,
          report_year: Number(payload?.period?.year) || new Date().getFullYear(),
          report_month: String(payload?.period?.month || ''),
          department_scope: String(payload?.department_scope || 'All'),
          topic,
          headline: result.headline,
          narrative: result.narrative,
          highlights: result.highlights,
          model: aiModel || null,
          generated_by: user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'company_id,report_year,report_month,department_scope,topic' })
    }

    return jsonResponse({ result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = message.startsWith('Forbidden') ? 403 : 400
    return jsonResponse({ error: message }, status)
  }
})
