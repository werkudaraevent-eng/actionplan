// process-auto-locks — Cron Worker Edge Function
// ────────────────────────────────────────────────────────────────────
// Called by pg_cron (or external scheduler) to:
//   1. Find all monthly_lock_schedules where lock_date <= NOW() and not yet processed
//   2. For each due schedule, send deadline/lock notification emails to users in that tenant
//   3. Mark the schedule row as processed (notification_sent = true) for idempotency
//
// Security: Accepts either:
//   - Authorization: Bearer <service_role_key>
//   - x-cron-secret: <CRON_SECRET> (set via supabase secrets set CRON_SECRET=...)
//
// Deploy : supabase functions deploy process-auto-locks
// Secrets: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, CRON_SECRET
// ────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer@6.9.8"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// action_plans.month stores abbreviated names: 'Jan', 'Feb', etc.
const MONTH_ABBREVS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Replace {variable} placeholders in template strings */
function replaceVariables(text: string, data: Record<string, string>): string {
  let result = text
  for (const [key, value] of Object.entries(data)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }
  return result
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  const log: string[] = []
  const addLog = (msg: string) => { log.push(msg); console.log(`[process-auto-locks] ${msg}`) }

  try {
    // ─── 1. Environment variables ──────────────────────────────────
    const supabaseUrl        = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const cronSecret         = Deno.env.get('CRON_SECRET') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    // SMTP credentials (same secrets used by send-email)
    const smtpHost   = Deno.env.get('SMTP_HOST') ?? ''
    const smtpPort   = parseInt(Deno.env.get('SMTP_PORT') ?? '587', 10)
    const smtpUser   = Deno.env.get('SMTP_USER') ?? ''
    const smtpPass   = Deno.env.get('SMTP_PASS') ?? ''
    const smtpSecure = (Deno.env.get('SMTP_SECURE') ?? 'false').toLowerCase() === 'true'

    // ─── 2. Authentication ─────────────────────────────────────────
    // Accept either service_role Bearer token OR custom cron secret header
    const authHeader  = req.headers.get('Authorization') ?? ''
    const cronHeader  = req.headers.get('x-cron-secret') ?? ''
    const bearerToken = authHeader.replace('Bearer ', '')

    const isServiceRole = bearerToken === supabaseServiceKey
    const isCronAuth    = cronSecret && cronHeader === cronSecret

    if (!isServiceRole && !isCronAuth) {
      return jsonResponse({ success: false, message: 'Unauthorized: requires service_role key or valid CRON_SECRET' }, 401)
    }

    // ─── 3. Initialize Supabase Admin client ───────────────────────
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ─── 4. Query due schedules (lock_date <= NOW, not yet notified) ─
    const now = new Date().toISOString()

    const { data: dueSchedules, error: fetchError } = await supabase
      .from('monthly_lock_schedules')
      .select('month_index, year, lock_date, is_force_open, company_id, notification_sent')
      .lte('lock_date', now)
      .or('notification_sent.is.null,notification_sent.eq.false')
      .eq('is_force_open', false) // Skip months where auto-lock is disabled

    if (fetchError) throw new Error(`Failed to fetch schedules: ${fetchError.message}`)

    if (!dueSchedules || dueSchedules.length === 0) {
      addLog('No due schedules found. Nothing to process.')
      return jsonResponse({ success: true, message: 'No due schedules', processed: 0, log })
    }

    addLog(`Found ${dueSchedules.length} due schedule(s) to process.`)

    // ─── 5. Configure SMTP transporter ─────────────────────────────
    let transporter: ReturnType<typeof nodemailer.createTransport> | null = null
    if (smtpHost && smtpUser && smtpPass) {
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: { user: smtpUser, pass: smtpPass },
        tls: { rejectUnauthorized: false },
      })
      addLog('SMTP transporter configured.')
    } else {
      addLog('WARNING: SMTP not configured — emails will be skipped.')
    }

    // ─── 6. Process each due schedule ──────────────────────────────
    let processed = 0
    let emailsSent = 0
    let errors = 0

    for (const schedule of dueSchedules) {
      const { month_index, year, lock_date, company_id } = schedule
      const monthName = MONTH_NAMES[month_index] ?? `Month ${month_index}`

      addLog(`Processing: ${monthName} ${year} for company ${company_id}`)

      try {
        // ── 6a. Fetch company name ─────────────────────────────────
        const { data: company } = await supabase
          .from('companies')
          .select('name')
          .eq('id', company_id)
          .maybeSingle()

        const companyName = company?.name ?? 'Werkudara Group'

        // ── 6b. Fetch email template from system_settings ──────────
        const { data: settings } = await supabase
          .from('system_settings')
          .select('email_config')
          .eq('company_id', company_id)
          .maybeSingle()

        // Use auto_lock template if available, fallback to a sensible default
        const emailConfig = settings?.email_config
        const templates = emailConfig?.templates ?? {}
        const autoLockTemplate = templates.auto_lock ?? null
        const deadlineTemplate = templates.deadline_reminder ?? null

        // Pick the best available template
        const template = autoLockTemplate?.enabled !== false
          ? autoLockTemplate
          : deadlineTemplate

        const emailSubject = template?.subject ?? `Monthly Lock Applied - ${monthName} ${year}`
        const emailBody    = template?.body ?? `The action plans for ${monthName} ${year} have been locked as of ${new Date(lock_date).toLocaleDateString()}.`

        // ── 6c. Fetch action plans for this company+month and GROUP BY user ──
        // DEBUG: Log exact query parameters to diagnose ghost data issues
        const monthAbbrev = MONTH_ABBREVS[month_index] ?? `Month${month_index}`
        addLog(`  DEBUG query params → company_id: ${company_id}, month (abbrev): "${monthAbbrev}", month_index: ${month_index}, year: ${year}`)

        const { data: plans, error: plansError } = await supabase
          .from('action_plans')
          .select('pic, status, department_code')
          .eq('company_id', company_id)
          .eq('month', monthAbbrev)  // action_plans.month stores abbreviated names: 'Jan', 'Feb', etc.
          .eq('year', year)
          .is('deleted_at', null)

        addLog(`  DEBUG query result → ${plans?.length ?? 0} plan(s) returned`)

        if (plansError) {
          addLog(`  ERROR fetching action plans: ${plansError.message}`)
          errors++
          continue
        }

        if (!plans || plans.length === 0) {
          addLog(`  No action plans found for ${monthName} ${year}. Skipping emails.`)
        }

        // ── 6d. Aggregate plans by PIC (distinct users) ────────────
        // Build a map: PIC name → { total, achieved, department }
        const picMap = new Map<string, { total: number; achieved: number; department: string }>()
        if (plans) {
          for (const plan of plans) {
            const pic = (plan.pic || '').trim()
            if (!pic) continue
            const entry = picMap.get(pic) ?? { total: 0, achieved: 0, department: plan.department_code || '' }
            entry.total++
            if (plan.status === 'Achieved') entry.achieved++
            picMap.set(pic, entry)
          }
        }

        addLog(`  ${plans?.length ?? 0} plan(s), ${picMap.size} distinct PIC(s)`)

        // ── 6e. Send ONE email per distinct PIC ────────────────────
        if (transporter && picMap.size > 0) {
          const lockDateFormatted = new Date(lock_date).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })

          // Resolve PIC names to email addresses via profiles
          const picNames = Array.from(picMap.keys())
          const { data: picProfiles } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('company_id', company_id)
            .in('full_name', picNames)

          // Build a lookup: full_name → email
          const nameToEmail = new Map<string, string>()
          if (picProfiles) {
            for (const p of picProfiles) {
              if (p.full_name && p.email) {
                nameToEmail.set(p.full_name, p.email)
              }
            }
          }

          for (const [picName, stats] of picMap) {
            const email = nameToEmail.get(picName)
            if (!email) {
              addLog(`  WARN: No email found for PIC "${picName}". Skipping.`)
              continue
            }

            const templateData: Record<string, string> = {
              name: picName,
              email: email,
              month: monthName,
              year: String(year),
              lock_date: lockDateFormatted,
              days_remaining: '0',
              department: stats.department,
              total_plans: String(stats.total),
              achieved_count: String(stats.achieved),
              total_locked_plans: String(stats.total),
              company_name: companyName,
            }

            const personalizedSubject = replaceVariables(emailSubject, templateData)
            const personalizedBody    = replaceVariables(emailBody, templateData)

            try {
              await transporter.sendMail({
                from: `"${companyName}" <${smtpUser}>`,
                to: email,
                subject: personalizedSubject,
                text: personalizedBody,
                html: personalizedBody.replace(/\n/g, '<br>'),
              })
              emailsSent++
            } catch (emailErr: unknown) {
              const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr)
              addLog(`  WARN: Failed to email ${email}: ${errMsg}`)
            }
          }

          addLog(`  Sent ${emailsSent} email(s) to distinct PICs for ${monthName} ${year}.`)
        }

        // ── 6f. IDEMPOTENCY: Mark schedule as processed ────────────
        const { error: markError } = await supabase
          .from('monthly_lock_schedules')
          .update({ notification_sent: true })
          .eq('month_index', month_index)
          .eq('year', year)
          .eq('company_id', company_id)

        if (markError) {
          addLog(`  ERROR marking notification_sent: ${markError.message}`)
          errors++
        } else {
          processed++
          addLog(`  ✓ Marked as processed.`)
        }

      } catch (scheduleErr: unknown) {
        const errMsg = scheduleErr instanceof Error ? scheduleErr.message : String(scheduleErr)
        addLog(`  ERROR processing ${monthName} ${year}: ${errMsg}`)
        errors++
      }
    }

    // ─── 7. Summary ────────────────────────────────────────────────
    const elapsed = Date.now() - startTime
    const summary = `Processed ${processed}/${dueSchedules.length} schedule(s), ${emailsSent} email(s) sent, ${errors} error(s) in ${elapsed}ms`
    addLog(summary)

    return jsonResponse({
      success: true,
      message: summary,
      processed,
      emailsSent,
      errors,
      log,
    })

  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[process-auto-locks] Fatal error:', errMsg)
    return jsonResponse({ success: false, message: errMsg, log }, 500)
  }
})
