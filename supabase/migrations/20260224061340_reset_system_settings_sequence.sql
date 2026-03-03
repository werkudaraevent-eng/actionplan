-- Reset the auto-increment sequence for system_settings
-- This ensures new tenants do not collide with legacy row IDs
SELECT setval(
  pg_get_serial_sequence('public.system_settings', 'id'),
  COALESCE((SELECT MAX(id) FROM public.system_settings), 0) + 1,
  false
);