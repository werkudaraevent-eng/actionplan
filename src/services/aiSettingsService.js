import { supabase } from '../lib/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

// Calls the ai-settings edge function. It answers list_models and test failures with 200 and an
// `error` field for the caller to show; anything else that goes wrong is thrown.
export async function callAiSettings(action, payload = {}, { timeoutMs = 90000 } = {}) {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Missing active session');

  const response = await fetch(`${supabaseUrl}/functions/v1/ai-settings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action, ...payload }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `AI settings request failed (${response.status})`);
  return data;
}
