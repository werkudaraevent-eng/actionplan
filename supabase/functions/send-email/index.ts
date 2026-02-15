// send-email Edge Function — Generic transactional email sender via Resend
// Deploy: supabase functions deploy send-email
// Set secret: supabase secrets set RESEND_API_KEY=re_xxxxxxxxx

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ─── Environment checks ─────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    if (!resendApiKey) {
      throw new Error('Missing RESEND_API_KEY. Set it via: supabase secrets set RESEND_API_KEY=re_xxxxxxxxx')
    }

    // ─── Auth: Verify caller is an admin ────────────────────────────
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check admin role
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, email')
      .eq('id', user.id)
      .single()

    const roleLower = (profile?.role || '').toLowerCase()
    if (!roleLower.includes('admin')) {
      return new Response(
        JSON.stringify({ success: false, message: 'Only admins can send system emails' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── Parse request body ─────────────────────────────────────────
    const { to, subject, html, text } = await req.json()

    if (!to || !subject) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing required fields: to, subject' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── Send via Resend API ────────────────────────────────────────
    // NOTE: Using Resend's pre-verified sender for now.
    // Once you verify werkudara.com in Resend dashboard (https://resend.com/domains),
    // change this to: 'Werkudara Group <noreply@werkudara.com>'
    const resendPayload = {
      from: 'Werkudara Action Plan <onboarding@resend.dev>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || undefined,
      text: text || (html ? undefined : 'No content'),
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendPayload),
    })

    const resendData = await resendRes.json()

    if (!resendRes.ok) {
      console.error('Resend API error:', resendData)
      return new Response(
        JSON.stringify({
          success: false,
          message: resendData?.message || `Resend API returned ${resendRes.status}`,
          statusCode: resendRes.status,
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Email sent to ${Array.isArray(to) ? to.join(', ') : to}`,
        id: resendData?.id,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('send-email error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to send email',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
