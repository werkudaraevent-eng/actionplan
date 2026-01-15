// create-user Edge Function - With Full Debug Logging
// Deploy: supabase functions deploy create-user

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // ========================================
  // 1. CORS HANDLING - Return 200 immediately
  // ========================================
  if (req.method === 'OPTIONS') {
    console.log('[create-user] CORS preflight - OK')
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  console.log('[create-user] ====== REQUEST START ======')
  console.log('[create-user] Method:', req.method)
  console.log('[create-user] Time:', new Date().toISOString())

  try {
    // ========================================
    // 2. ENVIRONMENT CHECK
    // ========================================
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    console.log('[create-user] ENV - URL:', !!supabaseUrl, 'ANON:', !!supabaseAnonKey, 'SERVICE:', !!supabaseServiceKey)

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[create-user] FATAL: Missing environment variables')
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ========================================
    // 3. AUTH VERIFICATION - Who is calling?
    // ========================================
    const authHeader = req.headers.get('Authorization')
    console.log('[create-user] Auth Header Present:', !!authHeader)
    console.log('[create-user] Auth Header Value:', authHeader?.substring(0, 30) + '...')

    if (!authHeader) {
      console.error('[create-user] REJECTED: No Authorization header')
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Client to verify the caller's identity
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()

    // DEBUG LOG: Who is the authenticated user?
    console.log('[create-user] Auth User ID:', user?.id)
    console.log('[create-user] Auth User Email:', user?.email)
    console.log('[create-user] Auth Error:', userError?.message)

    if (userError || !user) {
      console.error('[create-user] REJECTED: Invalid token -', userError?.message)
      return new Response(JSON.stringify({ 
        error: 'Unauthorized: Invalid or expired token',
        debug: userError?.message 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ========================================
    // 4. ROLE VERIFICATION - Is caller admin/head?
    // ========================================
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, role, full_name')
      .eq('id', user.id)
      .single()

    // DEBUG LOG: What role does the caller have?
    console.log('[create-user] Caller Profile Found:', !!profile)
    console.log('[create-user] Caller Role in DB:', profile?.role)
    console.log('[create-user] Caller Name:', profile?.full_name)
    console.log('[create-user] Profile Error:', profileError?.message)

    if (profileError || !profile) {
      console.error('[create-user] REJECTED: Profile not found for user', user.id)
      return new Response(JSON.stringify({ 
        error: 'Unauthorized: No profile found for this user',
        userId: user.id 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // FLEXIBLE ROLE CHECK: Allow if role contains 'admin' OR 'head' (case-insensitive)
    const roleLower = (profile.role || '').toLowerCase()
    const isAuthorized = roleLower.includes('admin') || roleLower.includes('head')

    console.log('[create-user] Role Check - Raw:', profile.role, '| Lowercase:', roleLower, '| Authorized:', isAuthorized)

    if (!isAuthorized) {
      console.error('[create-user] REJECTED: Insufficient permissions. Role is:', profile.role)
      return new Response(JSON.stringify({ 
        error: `Forbidden: Your role '${profile.role}' cannot create users. Required: admin or dept_head.`
      }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('[create-user] ACCESS GRANTED for:', profile.email, 'with role:', profile.role)

    // ========================================
    // 5. PARSE REQUEST BODY
    // ========================================
    let body
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { email, password, fullName, role, department_code } = body
    console.log('[create-user] Creating user:', email, '| Role:', role, '| Dept:', department_code)

    if (!email || !password || !fullName) {
      console.error('[create-user] REJECTED: Missing required fields')
      return new Response(JSON.stringify({ 
        error: 'Missing required fields: email, password, fullName' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ========================================
    // 6. CREATE AUTH USER
    // ========================================
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    })

    if (createError) {
      console.error('[create-user] Auth create failed:', createError.message)
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    console.log('[create-user] Auth user created:', newUser.user?.id)

    // ========================================
    // 7. UPSERT PROFILE
    // ========================================
    if (newUser.user) {
      const { error: upsertError } = await supabaseAdmin
        .from('profiles')
        .upsert({
          id: newUser.user.id,
          email,
          full_name: fullName,
          role: role || 'staff',
          department_code: department_code || null,
          created_at: new Date().toISOString()
        }, { onConflict: 'id' })

      if (upsertError) {
        console.error('[create-user] Profile upsert failed:', upsertError.message)
        // Rollback
        await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
        return new Response(JSON.stringify({ error: upsertError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      console.log('[create-user] Profile created for:', email)
    }

    // ========================================
    // 8. SUCCESS
    // ========================================
    console.log('[create-user] ====== SUCCESS ======')
    return new Response(JSON.stringify({ 
      success: true,
      message: 'User created successfully',
      user: { id: newUser.user?.id, email }
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('[create-user] UNEXPECTED ERROR:', error)
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
