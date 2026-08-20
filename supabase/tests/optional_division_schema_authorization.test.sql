BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(28);

SELECT has_table('public', 'divisions', 'divisions table exists');
SELECT has_table('public', 'division_memberships', 'division memberships table exists');
SELECT has_column('public', 'action_plans', 'division_id', 'plans support optional division');
SELECT col_is_null('public', 'action_plans', 'division_id', 'plan division stays nullable');
SELECT has_column('public', 'system_settings', 'division_hierarchy_enabled', 'feature flag exists');
SELECT has_column('public', 'system_settings', 'division_readiness_policy', 'readiness policy exists');
SELECT function_returns(
  'public',
  'can_view_action_plan',
  ARRAY['uuid', 'text', 'uuid', 'uuid[]', 'uuid[]'],
  'boolean',
  'plan visibility helper exists'
);
SELECT function_returns(
  'public',
  'can_update_action_plan',
  ARRAY['uuid', 'text', 'uuid', 'uuid[]', 'uuid[]'],
  'boolean',
  'plan update helper exists'
);
SELECT policies_are(
  'public',
  'action_plans',
  ARRAY[
    'action_plans_delete_scope',
    'action_plans_insert_scope',
    'action_plans_select_scope',
    'action_plans_update_scope'
  ],
  'action plans have only unified scope policies'
);
SELECT policies_are(
  'public',
  'audit_logs',
  ARRAY['audit_logs_insert_own', 'audit_logs_select_scope'],
  'audit logs have only unified scope policies'
);
SELECT policies_are(
  'public',
  'progress_logs',
  ARRAY['progress_logs_insert_scope', 'progress_logs_select_scope'],
  'progress logs have only unified scope policies'
);
SELECT view_owner_is('public', 'audit_logs_with_user', 'postgres', 'audit view keeps expected owner');
SELECT is(
  (SELECT reloptions @> ARRAY['security_invoker=true'] FROM pg_class WHERE oid = 'public.audit_logs_with_user'::regclass),
  true,
  'audit view uses invoker security'
);
SELECT is(
  has_function_privilege('anon', 'public.finalize_department_month(text, integer, text, text)', 'EXECUTE'),
  false,
  'anonymous cannot finalize a department month'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'admin-a@test.local', jsonb_build_object('company_id', (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)), now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'leader-a@test.local', jsonb_build_object('company_id', (SELECT id FROM public.companies ORDER BY created_at LIMIT 1 OFFSET 0)), now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'staff-a@test.local', jsonb_build_object('company_id', (SELECT id FROM public.companies ORDER BY created_at LIMIT 1 OFFSET 0)), now(), now()),
  ('10000000-0000-0000-0000-000000000004', 'staff-b@test.local', jsonb_build_object('company_id', (SELECT id FROM public.companies ORDER BY created_at LIMIT 1 OFFSET 1)), now(), now());

UPDATE public.profiles
SET full_name = CASE id
      WHEN '10000000-0000-0000-0000-000000000001' THEN 'Admin A'
      WHEN '10000000-0000-0000-0000-000000000002' THEN 'Leader A'
      WHEN '10000000-0000-0000-0000-000000000003' THEN 'Staff A'
      ELSE 'Staff B'
    END,
    role = CASE id
      WHEN '10000000-0000-0000-0000-000000000001' THEN 'admin'
      WHEN '10000000-0000-0000-0000-000000000002' THEN 'leader'
      ELSE 'staff'
    END,
    department_code = CASE
      WHEN id = '10000000-0000-0000-0000-000000000004' THEN 'OPS_B'
      ELSE 'OPS_A'
    END;

INSERT INTO public.departments (code, name, company_id)
VALUES
  ('OPS_A', 'Operations A', (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000001')),
  ('OPS_B', 'Operations B', (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000004'));

INSERT INTO public.system_settings (id, company_id)
SELECT 9000 + row_number() OVER (), id
FROM public.companies
WHERE id IN (
  SELECT company_id FROM public.profiles
  WHERE id IN ('10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004')
)
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO public.divisions (id, company_id, department_code, code, name)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000001'),
  'OPS_A',
  'DIV_A',
  'Division A'
);

UPDATE public.system_settings
SET division_hierarchy_enabled = true
WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000001');

INSERT INTO public.division_memberships (
  user_id, division_id, company_id, department_code, membership_role
) VALUES (
  '10000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000001',
  (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000003'),
  'OPS_A',
  'division_leader'
);

INSERT INTO public.action_plans (
  id, company_id, department_code, division_id, year, month,
  goal_strategy, action_plan, indicator, status, pic_ids
) VALUES
  (
    '30000000-0000-0000-0000-000000000001',
    (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000001'),
    'OPS_A', NULL, 2026, 'Jan', 'Goal', 'Department Plan', 'Indicator', 'Open',
    ARRAY['10000000-0000-0000-0000-000000000002'::uuid]
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000001'),
    'OPS_A', '20000000-0000-0000-0000-000000000001', 2026, 'Jan', 'Goal', 'Division Plan', 'Indicator', 'Open',
    ARRAY['10000000-0000-0000-0000-000000000002'::uuid]
  );

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*)::integer FROM public.action_plans),
  1,
  'division leader sees exact led division but not department-level plan'
);
SELECT lives_ok(
  $$UPDATE public.action_plans SET remark = 'not authorized' WHERE id = '30000000-0000-0000-0000-000000000002'$$,
  'non-PIC update is filtered by RLS without leaking row existence'
);
SELECT is(
  (SELECT remark FROM public.action_plans WHERE id = '30000000-0000-0000-0000-000000000002'),
  NULL,
  'division leader cannot edit non-PIC led plan'
);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
UPDATE public.action_plans
SET pic_ids = ARRAY['10000000-0000-0000-0000-000000000003'::uuid]
WHERE id = '30000000-0000-0000-0000-000000000002';
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.action_plans SET remark = 'progress note' WHERE id = '30000000-0000-0000-0000-000000000002'$$,
  'division leader can update own-PIC plan'
);
SELECT throws_ok(
  $$UPDATE public.action_plans SET division_id = NULL WHERE id = '30000000-0000-0000-0000-000000000002'$$,
  '42501',
  'ACTION_PLAN_SCOPE_CHANGE_DENIED',
  'division leader cannot move own-PIC plan scope'
);
SELECT is(
  (SELECT count(*)::integer FROM public.action_plans WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000004')),
  0,
  'division leader cannot read cross-company plans'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.action_plans), 2, 'department leader sees department and division plans');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
UPDATE public.system_settings
SET division_hierarchy_enabled = false
WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000001');
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.action_plans), 2, 'feature off restores staff department visibility');
SELECT lives_ok(
  $$UPDATE public.action_plans SET remark = 'legacy update' WHERE department_code = 'OPS_A'$$,
  'feature off restores staff department update behavior'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.action_plans), 0, 'cross-company staff sees no company A plans');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$UPDATE public.system_settings SET division_hierarchy_enabled = true WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000003')$$,
  '42501',
  'DIVISION_SETTINGS_ADMIN_REQUIRED',
  'staff cannot enable division feature'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.system_settings SET division_hierarchy_enabled = true WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000001')$$,
  'company admin can enable division feature'
);
RESET ROLE;

DELETE FROM public.system_settings
WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000004');
INSERT INTO public.action_plans (
  id, company_id, department_code, year, month,
  goal_strategy, action_plan, indicator, status, pic_ids
) VALUES (
  '30000000-0000-0000-0000-000000000003',
  (SELECT company_id FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000004'),
  'OPS_B', 2026, 'Feb', 'Goal', 'No Settings Plan', 'Indicator', 'Open',
  ARRAY['10000000-0000-0000-0000-000000000004'::uuid]
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::integer FROM public.action_plans),
  1,
  'missing system settings defaults to feature-off department visibility'
);
SELECT lives_ok(
  $$UPDATE public.action_plans SET remark = 'legacy no-settings update' WHERE id = '30000000-0000-0000-0000-000000000003'$$,
  'missing system settings defaults to feature-off staff update behavior'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
