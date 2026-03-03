// send-system-email Edge Function - Send emails via SMTP or Gmail
// Deploy: supabase functions deploy send-system-email
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.8";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Test data for variable replacement
const TEST_DATA = {
  name: 'Test User',
  email: 'test@example.com',
  link: 'https://example.com/reset?token=abc123',
  month: 'January',
  year: '2026',
  lock_date: 'January 6, 2026',
  days_remaining: '3',
  department: 'Human Resources',
  total_plans: '25',
  achieved_count: '20',
  plan_title: 'Q1 Budget Review',
  score: '85',
  feedback: 'Great work on the documentation!',
  reviewer_name: 'Admin User'
};
// Replace template variables with test data
function replaceVariables(text, data) {
  let result = text;
  for (const [key, value] of Object.entries(data)){
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}
serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Initialize Supabase client for auth verification
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing environment variables');
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    // Verify caller authorization (admin only)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Missing authorization header'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Invalid or expired token'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Check admin role
    const { data: profile } = await supabaseAdmin.from('profiles').select('role, email').eq('id', user.id).single();
    const roleLower = (profile?.role || '').toLowerCase();
    if (!roleLower.includes('admin')) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Only admins can send system emails'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Parse request body
    const { providerConfig, template, recipientEmail } = await req.json();
    if (!providerConfig || !template) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Missing providerConfig or template'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Use admin's email as recipient if not specified
    const toEmail = recipientEmail || profile?.email || user.email;
    // Configure nodemailer transporter based on provider type
    let transporter;
    if (providerConfig.type === 'gmail') {
      // Gmail configuration
      if (!providerConfig.email || !providerConfig.appPassword) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Gmail requires email and appPassword'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: providerConfig.email,
          pass: providerConfig.appPassword
        }
      });
    } else {
      // SMTP configuration
      if (!providerConfig.host || !providerConfig.port || !providerConfig.username || !providerConfig.password) {
        return new Response(JSON.stringify({
          success: false,
          message: 'SMTP requires host, port, username, and password'
        }), {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      transporter = nodemailer.createTransport({
        host: providerConfig.host,
        port: parseInt(providerConfig.port, 10),
        secure: providerConfig.security === 'ssl',
        auth: {
          user: providerConfig.username,
          pass: providerConfig.password
        },
        tls: providerConfig.security === 'tls' ? {
          rejectUnauthorized: false
        } : undefined
      });
    }
    // Replace variables in template with test data
    const subject = replaceVariables(template.subject, TEST_DATA);
    const body = replaceVariables(template.body, TEST_DATA);
    // Determine sender email
    const fromEmail = providerConfig.type === 'gmail' ? providerConfig.email : providerConfig.username;
    // Send the email
    const mailOptions = {
      from: `"Werkudara Group" <${fromEmail}>`,
      to: toEmail,
      subject: `[TEST] ${subject}`,
      text: body,
      html: body.replace(/\n/g, '<br>')
    };
    await transporter.sendMail(mailOptions);
    return new Response(JSON.stringify({
      success: true,
      message: `Test email sent to ${toEmail}`
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Email send error:', error);
    return new Response(JSON.stringify({
      success: false,
      message: error instanceof Error ? error.message : 'Failed to send email'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
