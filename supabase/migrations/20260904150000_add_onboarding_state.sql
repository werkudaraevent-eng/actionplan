-- Remember whether somebody has been shown the introduction.
--
-- Kept on the profile rather than in localStorage, which is where the changelog marker
-- lives. A changelog badge reappearing on a second browser is harmless; an introduction
-- restarting every time somebody opens the app on their phone is not, and someone who
-- has already learned the app should never be walked through it again because they
-- cleared their cache.
--
-- Written by the person themselves when they finish or skip, so it is deliberately NOT
-- added to protect_profile_security_fields: unlike role or department, this is theirs to
-- set. The existing users_update_own_avatar policy already permits a profile to update
-- its own row, and the guard trigger still blocks everything that matters.
--
-- Null means never shown. A version is stored alongside the timestamp so a materially
-- changed tour can be offered again later without a second column.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_version integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.onboarding_completed_at IS
  'When this person finished or skipped the introduction. Null means it has never been shown.';
COMMENT ON COLUMN public.profiles.onboarding_version IS
  'Which version of the introduction they saw, so a reworked tour can be offered again.';
