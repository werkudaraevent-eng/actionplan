BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(21);

SELECT has_table('public', 'division_month_readiness', 'readiness snapshot table exists');
SELECT has_table('public', 'division_readiness_events', 'readiness event table exists');
SELECT has_pk('public', 'division_month_readiness', 'readiness period has primary key');
SELECT has_function(
  'public',
  'mark_division_month_ready',
  ARRAY['uuid', 'integer', 'text'],
  'mark-ready RPC exists'
);
SELECT has_function(
  'public',
  'get_department_division_readiness',
  ARRAY['text', 'integer', 'text'],
  'readiness status RPC exists'
);
SELECT has_trigger(
  'public',
  'action_plans',
  'invalidate_division_readiness_on_plan_change',
  'plan mutation invalidates readiness'
);
SELECT is(
  has_function_privilege('anon', 'public.mark_division_month_ready(uuid, integer, text)', 'EXECUTE'),
  false,
  'anonymous cannot mark ready'
);
SELECT is(
  has_function_privilege('authenticated', 'public.mark_division_month_ready(uuid, integer, text)', 'EXECUTE'),
  true,
  'authenticated caller can invoke mark-ready contract'
);
SELECT is(
  has_function_privilege('authenticated', 'public.compute_division_period_fingerprint(uuid, text, uuid, integer, text)', 'EXECUTE'),
  false,
  'fingerprint helper is internal'
);
SELECT is(
  has_function_privilege('authenticated', 'public.lock_department_period(uuid, text, integer, text)', 'EXECUTE'),
  false,
  'period lock helper is internal'
);
SELECT policies_are(
  'public',
  'division_month_readiness',
  ARRAY['division_month_readiness_select'],
  'readiness snapshots are read-only through RLS'
);
SELECT policies_are(
  'public',
  'division_readiness_events',
  ARRAY['division_readiness_events_select'],
  'readiness events are append-only to clients'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('11000000-0000-0000-0000-000000000001', 'ready-admin@test.local', jsonb_build_object('company_id', (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)), now(), now()),
  ('11000000-0000-0000-0000-000000000002', 'ready-leader@test.local', jsonb_build_object('company_id', (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)), now(), now());

UPDATE public.profiles
SET full_name = CASE WHEN id = '11000000-0000-0000-0000-000000000001' THEN 'Ready Admin' ELSE 'Ready Leader' END,
    role = CASE WHEN id = '11000000-0000-0000-0000-000000000001' THEN 'admin' ELSE 'staff' END,
    department_code = 'READY'
WHERE id IN ('11000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002');

INSERT INTO public.departments (code, name, company_id)
VALUES ('READY', 'Readiness Department', (SELECT company_id FROM public.profiles WHERE id = '11000000-0000-0000-0000-000000000001'));

INSERT INTO public.system_settings (id, company_id, division_hierarchy_enabled)
VALUES (
  9101,
  (SELECT company_id FROM public.profiles WHERE id = '11000000-0000-0000-0000-000000000001'),
  true
)
ON CONFLICT (company_id) DO UPDATE SET division_hierarchy_enabled = true;

INSERT INTO public.divisions (id, company_id, department_code, code, name)
VALUES (
  '21000000-0000-0000-0000-000000000001',
  (SELECT company_id FROM public.profiles WHERE id = '11000000-0000-0000-0000-000000000001'),
  'READY',
  'READY_DIV',
  'Ready Division'
);

INSERT INTO public.division_memberships (user_id, division_id, company_id, department_code, membership_role)
VALUES (
  '11000000-0000-0000-0000-000000000002',
  '21000000-0000-0000-0000-000000000001',
  (SELECT company_id FROM public.profiles WHERE id = '11000000-0000-0000-0000-000000000002'),
  'READY',
  'division_leader'
);

INSERT INTO public.action_plans (
  id, company_id, department_code, division_id, year, month,
  goal_strategy, action_plan, indicator, status, pic_ids
) VALUES (
  '31000000-0000-0000-0000-000000000001',
  (SELECT company_id FROM public.profiles WHERE id = '11000000-0000-0000-0000-000000000001'),
  'READY',
  '21000000-0000-0000-0000-000000000001',
  2026,
  'Jan',
  'Goal',
  'Ready Plan',
  'Indicator',
  'Achieved',
  ARRAY['11000000-0000-0000-0000-000000000002'::uuid]
);

SELECT set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.mark_division_month_ready('21000000-0000-0000-0000-000000000001', 2026, 'Jan')$$,
  'active division leader can mark terminal month ready'
);
SELECT is(
  (SELECT count(*)::integer FROM public.division_month_readiness WHERE invalidated_at IS NULL),
  1,
  'ready snapshot remains current after mark ready'
);
SELECT lives_ok(
  $$UPDATE public.action_plans SET remark = 'ordinary note' WHERE id = '31000000-0000-0000-0000-000000000001'$$,
  'remark-only update succeeds'
);
SELECT is(
  (SELECT count(*)::integer FROM public.division_month_readiness WHERE invalidated_at IS NULL),
  1,
  'remark-only update does not invalidate readiness'
);
SELECT lives_ok(
  $$INSERT INTO public.progress_logs (action_plan_id, user_id, message) VALUES ('31000000-0000-0000-0000-000000000001', '11000000-0000-0000-0000-000000000002', 'progress')$$,
  'progress log insert succeeds'
);
SELECT is(
  (SELECT count(*)::integer FROM public.division_month_readiness WHERE invalidated_at IS NULL),
  1,
  'progress log does not invalidate readiness'
);
SELECT lives_ok(
  $$UPDATE public.action_plans SET action_plan = 'Meaningful edit' WHERE id = '31000000-0000-0000-0000-000000000001'$$,
  'meaningful plan update succeeds'
);
SELECT is(
  (SELECT count(*)::integer FROM public.division_month_readiness WHERE invalidated_at IS NOT NULL),
  1,
  'meaningful plan update invalidates readiness'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000001', true);
UPDATE public.profiles
SET department_code = NULL,
    additional_departments = ARRAY[]::text[]
WHERE id = '11000000-0000-0000-0000-000000000002';
SELECT set_config('request.jwt.claim.sub', '11000000-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.mark_division_month_ready('21000000-0000-0000-0000-000000000001', 2026, 'Jan')$$,
  '42501',
  'NOT_DIVISION_LEADER',
  'stale membership loses readiness authority after department access removal'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
