// supabase/functions/create-user/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Setup CORS headers agar Frontend (React) boleh akses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // 1. Handle Preflight Request (CORS) - Wajib untuk Browser
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 2. Ambil data yang dikirim Frontend
    const { email, password, fullName, role, department_code } = await req.json()

    // 3. Validasi Input Dasar
    if (!email || !password || !fullName) {
      throw new Error("Missing required fields: email, password, or fullName")
    }

    // 4. Init Supabase Admin Client (Menggunakan Service Role Key dari Environment)
    // Deno.env.get otomatis mengambil key dari dashboard Supabase nanti
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 5. CREATE USER di Auth (Tabel auth.users)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto confirm email
      user_metadata: { full_name: fullName }
    })

    if (authError) throw authError

    // 6. UPDATE / UPSERT Profile (Tabel public.profiles)
    // Kita gunakan UPSERT untuk menimpa jika trigger sudah membuat row kosong
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id, // ID ini PASTI sama dengan auth user
        email: email,
        full_name: fullName,
        role: role || 'staff', // Default ke staff jika kosong
        department_code: department_code || null,
        created_at: new Date()
      })

    if (profileError) throw profileError

    // 7. Sukses!
    return new Response(
      JSON.stringify({ message: 'User created successfully', user: authData.user }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    // Handle Error
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    )
  }
})