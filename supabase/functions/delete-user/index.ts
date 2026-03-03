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

    // Authenticate the calling user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing authorization header')

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) throw new Error('Invalid or expired token')

    // Verify calling user is an admin
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !callerProfile) throw new Error('Caller profile not found')

    const callerRole = (callerProfile.role || '').toLowerCase()
    const isAuthorized = callerRole === 'admin' || callerRole === 'holding_admin'
    if (!isAuthorized) throw new Error(`Forbidden: Role '${callerProfile.role}' cannot delete users`)

    // Parse request body
    const { userId } = await req.json()
    if (!userId) throw new Error('Missing required field: userId')

    // Prevent self-deletion
    if (userId === user.id) throw new Error('You cannot delete your own account')

    // Verify target user exists
    const { data: targetProfile, error: targetError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name, role, company_id')
      .eq('id', userId)
      .single()

    if (targetError || !targetProfile) throw new Error('Target user not found')

    // Prevent non-holding-admins from deleting holding_admin users
    if (targetProfile.role === 'holding_admin' && callerRole !== 'holding_admin') {
      throw new Error('Only holding admins can delete other holding admin accounts')
    }

    // Multi-tenant guard: regular admins can only delete users in their own company
    if (callerRole === 'admin') {
      const { data: callerFull } = await supabaseAdmin
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single()

      if (callerFull?.company_id && targetProfile.company_id !== callerFull.company_id) {
        throw new Error('Cannot delete users from a different company')
      }
    }

    // Step 1: Delete associated data that might have FK constraints
    // (Soft-delete approach: nullify references rather than cascade-delete)
    // The auth.users deletion will cascade to profiles via Supabase's built-in trigger

    // Step 2: Delete the user from auth.users
    // This is the key step that requires service_role — it cannot be done from the client
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteAuthError) {
      throw new Error(`Failed to delete auth user: ${deleteAuthError.message}`)
    }

    // Step 3: Explicitly delete the profile row (in case the cascade didn't fire)
    await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)

    return new Response(
      JSON.stringify({
        success: true,
        message: `User "${targetProfile.full_name}" deleted successfully`,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
