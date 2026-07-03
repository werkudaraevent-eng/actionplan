import { supabase } from '../lib/supabase';

/**
 * Fire-and-forget usage event tracking. Never blocks or throws into the UI —
 * a failed insert is logged at debug level and otherwise ignored.
 */
export function trackEvent({ eventType, path = null, userId, companyId = null, departmentCode = null }) {
  if (!userId || !eventType) return;
  supabase
    .from('usage_events')
    .insert({
      user_id: userId,
      company_id: companyId,
      department_code: departmentCode,
      event_type: eventType,
      path,
    })
    .then(({ error }) => {
      if (error) console.debug('[usage] track failed:', error.message);
    });
}
