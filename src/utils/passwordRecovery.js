/**
 * A password-reset email is, mechanically, a login link: Supabase verifies the token and
 * hands the browser a full session. Without something remembering that the session came
 * from a reset link, the app treats it like any other login and opens the dashboard — the
 * person never gets asked for a new password.
 *
 * The evidence is short-lived. supabase-js reads `#...&type=recovery` from the URL and then
 * wipes the hash, and the PASSWORD_RECOVERY event it fires can land before React has
 * subscribed. So the URL is read once, synchronously, before the client is created, and the
 * intent is written down until the password is actually changed or the person signs out.
 */

const STORAGE_KEY = 'wk_password_recovery_pending';

/** Recovery paths every reset email points at; kept in one place so callers cannot drift. */
export const PASSWORD_RESET_PATH = '/reset-password';

export function passwordResetRedirectUrl(origin = window.location.origin) {
  return `${origin}${PASSWORD_RESET_PATH}`;
}

/** Whether a URL is the landing of a reset link (implicit flow puts it in the hash). */
export function urlSignalsRecovery(href) {
  if (!href) return false;
  try {
    const url = new URL(href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
    return hashParams.get('type') === 'recovery' || url.searchParams.get('type') === 'recovery';
  } catch {
    return false;
  }
}

// Storage can be unavailable (private window, blocked site data). Losing the flag only
// brings back the old behaviour, so failures are swallowed rather than surfaced.
export function markRecoveryPending() {
  try { window.localStorage.setItem(STORAGE_KEY, '1'); } catch { /* storage unavailable */ }
}

export function isRecoveryPending() {
  try { return window.localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

export function clearRecoveryPending() {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ }
}

/** Call before the Supabase client is created, while the hash is still in the address bar. */
export function captureRecoveryFromUrl() {
  if (typeof window === 'undefined') return;
  if (urlSignalsRecovery(window.location.href)) markRecoveryPending();
}
