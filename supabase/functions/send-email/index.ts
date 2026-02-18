// send-email Edge Function — Secure transactional email sender via Nodemailer + SMTP
// Credentials are stored in Supabase Secrets (Deno.env), NOT passed from the client.
//
// Deploy : supabase functions deploy send-email
// Secrets: supabase secrets set SMTP_HOST=mail.uranus.webmail SMTP_PORT=587 SMTP_USER=noreply@werkudara.com SMTP_PASS=YourPassword SMTP_SECURE=false

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import nodemailer from "npm:nodemailer@6.9.8"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Helper: build a JSON Response with CORS */
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req: Request) => {
  // ─── CORS preflight ────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ─── 1. Environment checks ─────────────────────────────────────
    const supabaseUrl        = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    // SMTP credentials — stored as Supabase Secrets
    const smtpHost   = Deno.env.get('SMTP_HOST') ?? ''
    const smtpPort   = parseInt(Deno.env.get('SMTP_PORT') ?? '587', 10)
    const smtpUser   = Deno.env.get('SMTP_USER') ?? ''
    const smtpPass   = Deno.env.get('SMTP_PASS') ?? ''
    const smtpSecure = (Deno.env.get('SMTP_SECURE') ?? 'false').toLowerCase() === 'true'

    if (!smtpHost || !smtpUser || !smtpPass) {
      throw new Error(
        'Missing SMTP secrets. Set them via: supabase secrets set SMTP_HOST=... SMTP_PORT=... SMTP_USER=... SMTP_PASS=... SMTP_SECURE=false'
      )
    }

    // ─── 2. Auth: Verify caller is an admin ────────────────────────
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ success: false, message: 'Missing authorization header' }, 401)
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return jsonResponse({ success: false, message: 'Invalid or expired token' }, 401)
    }

    // Check admin role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, email')
      .eq('id', user.id)
      .single()

    const roleLower = (profile?.role || '').toLowerCase()
    if (!roleLower.includes('admin')) {
      return jsonResponse({ success: false, message: 'Only admins can send system emails' }, 403)
    }

    // ─── 3. Parse request body ─────────────────────────────────────
    const { to, subject, html, text } = await req.json()

    if (!to || !subject) {
      return jsonResponse({ success: false, message: 'Missing required fields: to, subject' }, 400)
    }

    // ─── 4. Configure Nodemailer transporter from secrets ──────────
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,           // true for 465, false for 587 (STARTTLS)
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
      tls: {
        // Allow self-signed certs on internal mail servers
        rejectUnauthorized: false,
      },
    })

    // ─── 5. Build and send email ───────────────────────────────────
    const recipients = Array.isArray(to) ? to.join(', ') : to

    const mailOptions = {
      from: `"Werkudara Group" <${smtpUser}>`,
      to: recipients,
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : (!html ? { text: 'No content' } : {})),
    }

    const info = await transporter.sendMail(mailOptions)

    console.log('Email sent:', info.messageId)

    return jsonResponse({
      success: true,
      message: `Email sent to ${recipients}`,
      messageId: info.messageId,
    })

  } catch (error) {
    console.error('send-email error:', error)
    return jsonResponse(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send email',
      },
      500
    )
  }
})
