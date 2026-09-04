import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ONBOARDING_VERSION, getOnboardingSteps } from '../components/onboarding/onboardingSteps';

/**
 * Decides whether the introduction should run, and remembers the answer on the profile.
 *
 * Finishing and skipping are recorded identically. Somebody who dismissed the tour has
 * told us they do not want it; showing it again on their next visit would be arguing
 * with them.
 */
export function useOnboarding() {
  const { profile } = useAuth();
  const [active, setActive] = useState(false);
  // Set the moment the tour opens rather than when it closes, so a slow write or a
  // refresh mid-tour cannot make it reappear in the same session.
  const [handled, setHandled] = useState(false);

  const steps = getOnboardingSteps(profile?.role);
  const neverSeen = profile != null && profile.onboarding_completed_at == null;
  const sawOlderVersion = profile != null
    && profile.onboarding_completed_at != null
    && (profile.onboarding_version ?? 0) < ONBOARDING_VERSION;

  useEffect(() => {
    if (handled || active) return undefined;
    if (!neverSeen && !sawOlderVersion) return undefined;

    // The tour points at rendered elements, so it waits for the page behind it to exist.
    const timer = setTimeout(() => setActive(true), 900);
    return () => clearTimeout(timer);
  }, [handled, active, neverSeen, sawOlderVersion]);

  // Plain functions: these are called from event handlers, so a stable identity buys
  // nothing and only invites the memoization lint to complain about an async callback.
  const remember = async () => {
    setActive(false);
    setHandled(true);
    if (!profile?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update({
        onboarding_completed_at: new Date().toISOString(),
        onboarding_version: ONBOARDING_VERSION,
      })
      .eq('id', profile.id);
    // A failed write only means the tour offers itself again next time, which is a far
    // smaller problem than blocking someone behind an error they cannot act on.
    if (error) console.error('[onboarding] could not record completion:', error.message);
  };

  const restart = () => {
    setHandled(false);
    setActive(true);
  };

  return { active, steps, finish: remember, skip: remember, restart };
}
