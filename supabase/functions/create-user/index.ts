import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing environment variables')

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) throw new Error('Invalid or expired token')

    // [MODIFIKASI ARSITEKTUR]: Ambil role DAN company_id milik Admin pembuat
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role, company_id')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) throw new Error('User profile not found')

    const roleLower = (profile.role || '').toLowerCase()
    const isAuthorized = roleLower.includes('admin') || roleLower.includes('head')
    if (!isAuthorized) throw new Error(`Forbidden: Role '${profile.role}' cannot create users`)

    const { email, password, fullName, role, department_code, additional_departments, company_id } = await req.json()
    if (!email || !password || !fullName) throw new Error('Missing required fields')

    // [MODIFIKASI ARSITEKTUR]: Tentukan KTP Perusahaan. 
    // Jika request membawa company_id (Super Admin), gunakan itu. Jika tidak, wariskan KTP milik Admin.
    const targetCompanyId = company_id || profile.company_id;
    if (!targetCompanyId) throw new Error('Company ID is required but missing from system')

    // [MODIFIKASI ARSITEKTUR]: Suntikkan KTP ke metadata saat membuat user di Auth
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { 
        full_name: fullName,
        company_id: targetCompanyId 
      }
    })

    if (createError) throw new Error(createError.message)
    if (!newUser.user) throw new Error('User creation returned no user object')

    await new Promise(resolve => setTimeout(resolve, 100))

    const { error: profileUpdateError } = await supabaseAdmin
      .from('profiles')
      .update({
        full_name: fullName,
        role: role || 'staff',
        department_code: department_code || null,
        additional_departments: additional_departments || [],
        company_id: targetCompanyId // Pastikan profil menerima KTP yang benar
      })
      .eq('id', newUser.user.id)

    if (profileUpdateError) {
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id)
      throw new Error(`Profile update failed: ${profileUpdateError.message}`)
    }

    return new Response(
      JSON.stringify({ success: true, message: 'User created successfully', user: { id: newUser.user.id, email } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})