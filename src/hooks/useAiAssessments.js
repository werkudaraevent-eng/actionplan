import { useCallback, useState } from 'react';
import { supabase } from '../lib/supabase';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

export function useAiAssessments() {
  const [latestAssessment, setLatestAssessment] = useState(null);
  const [cached, setCached] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const analyzeEvidence = useCallback(async (actionPlanId, { force = false } = {}) => {
    if (!actionPlanId) return null;
    if (!supabase) {
      setError('Supabase not configured');
      return null;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Missing active session');

      const response = await fetch(`${supabaseUrl}/functions/v1/analyze-evidence`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actionPlanId, force }),
        signal: AbortSignal.timeout(120000),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || data?.error) {
        throw new Error(data?.error || `Analyze request failed (${response.status})`);
      }

      setLatestAssessment(data?.assessment || null);
      setCached(!!data?.cached);
      return data;
    } catch (err) {
      const message = err?.message || 'Failed to analyze evidence';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setLatestAssessment(null);
    setCached(false);
    setLoading(false);
    setError(null);
  }, []);

  return {
    analyzeEvidence,
    latestAssessment,
    cached,
    loading,
    error,
    reset,
  };
}
