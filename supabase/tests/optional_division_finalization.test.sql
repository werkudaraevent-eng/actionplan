BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(36);

SELECT has_function(
  'public',
  'finalize_department_month',
  ARRAY['text', 'integer', 'text', 'text'],
  'atomic finalization RPC exists'
);
SELECT function_returns(
  'public',
  'finalize_department_month',
  ARRAY['text', 'integer', 'text', 'text'],
  'jsonb',
  'atomic finalization returns structured result'
);
SELECT has_function(
  'public',
  'create_carry_over_plan_internal',
  ARRAY['uuid', 'uuid'],
  'private carry-over helper exists'
);
SELECT has_function(
  'public',
  'carry_over_plan',
  ARRAY['uuid', 'uuid'],
  'compatibility carry-over RPC exists'
);
SELECT has_trigger(
  'public',
  'action_plans',
  'protect_action_plan_finalization_fields',
  'direct finalization fields are guarded'
);
SELECT is(
  has_function_privilege('anon', 'public.finalize_department_month(text, integer, text, text)', 'EXECUTE'),
  false,
  'anonymous cannot finalize'
);
SELECT is(
  has_function_privilege('authenticated', 'public.finalize_department_month(text, integer, text, text)', 'EXECUTE'),
  true,
  'authenticated caller can invoke finalization contract'
);
SELECT is(
  has_function_privilege('anon', 'public.carry_over_plan(uuid, uuid)', 'EXECUTE'),
  false,
  'anonymous cannot carry over plans'
);
SELECT is(
  has_function_privilege('authenticated', 'public.create_carry_over_plan_internal(uuid, uuid)', 'EXECUTE'),
  false,
  'internal carry-over helper is not client executable'
);
SELECT is(
  has_function_privilege('anon', 'public.resolve_and_submit_report(text, text, integer, jsonb, uuid)', 'EXECUTE'),
  false,
  'anonymous cannot invoke legacy resolution compatibility RPC'
);
SELECT is(
  has_function_privilege('authenticated', 'public.resolve_and_submit_report_legacy_internal(text, text, integer, jsonb, uuid)', 'EXECUTE'),
  false,
  'legacy resolution implementation is internal only'
);
SELECT throws_ok(
  $$SELECT public.finalize_department_month('NOPE', 2026, 'Jan', NULL)$$,
  '42501',
  'AUTHENTICATION_REQUIRED',
  'anonymous finalization is rejected'
);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
SELECT throws_ok(
  $$SELECT public.finalize_department_month('NOPE', 2026, 'BadMonth', NULL)$$,
  '22023',
  'INVALID_PERIOD',
  'authenticated request gets stable invalid-period code'
);

INSERT INTO auth.users (id, email, raw_user_meta_data, created_at, updated_at)
VALUES
  ('12000000-0000-0000-0000-000000000001', 'final-admin@test.local', jsonb_build_object('company_id', (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)), now(), now()),
  ('12000000-0000-0000-0000-000000000002', 'final-leader@test.local', jsonb_build_object('company_id', (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)), now(), now()),
  ('12000000-0000-0000-0000-000000000003', 'final-division@test.local', jsonb_build_object('company_id', (SELECT id FROM public.companies ORDER BY created_at LIMIT 1)), now(), now());

UPDATE public.profiles
SET full_name = CASE id
      WHEN '12000000-0000-0000-0000-000000000001' THEN 'Final Admin'
      WHEN '12000000-0000-0000-0000-000000000002' THEN 'Final Leader'
      ELSE 'Final Division Leader'
    END,
    role = CASE
      WHEN id = '12000000-0000-0000-0000-000000000001' THEN 'admin'
      WHEN id = '12000000-0000-0000-0000-000000000002' THEN 'leader'
      ELSE 'staff'
    END,
    department_code = 'FINAL'
WHERE id IN (
  '12000000-0000-0000-0000-000000000001',
  '12000000-0000-0000-0000-000000000002',
  '12000000-0000-0000-0000-000000000003'
);

INSERT INTO public.departments (code, name, company_id)
VALUES ('FINAL', 'Finalization Department', (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000001'));

SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);

INSERT INTO public.system_settings (
  id, company_id, division_hierarchy_enabled, division_readiness_policy
) VALUES (
  9201,
  (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000001'),
  true,
  'REQUIRED'
)
ON CONFLICT (company_id) DO UPDATE SET
  division_hierarchy_enabled = true,
  division_readiness_policy = 'REQUIRED';

INSERT INTO public.divisions (id, company_id, department_code, code, name)
VALUES (
  '22000000-0000-0000-0000-000000000001',
  (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000001'),
  'FINAL',
  'FINAL_DIV',
  'Final Division'
);

INSERT INTO public.division_memberships (user_id, division_id, company_id, department_code, membership_role)
VALUES (
  '12000000-0000-0000-0000-000000000003',
  '22000000-0000-0000-0000-000000000001',
  (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000003'),
  'FINAL',
  'division_leader'
);

SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);

INSERT INTO public.action_plans (
  id, company_id, department_code, division_id, recurring_group_id,
  year, month, goal_strategy, action_plan, indicator, status,
  resolution_type, pic_ids
) VALUES
  (
    '32000000-0000-0000-0000-000000000001',
    (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000001'),
    'FINAL', NULL, NULL, 2026, 'Feb', 'Goal', 'Department Achieved', 'Indicator', 'Achieved', NULL,
    ARRAY['12000000-0000-0000-0000-000000000002'::uuid]
  ),
  (
    '32000000-0000-0000-0000-000000000002',
    (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000001'),
    'FINAL', '22000000-0000-0000-0000-000000000001', '42000000-0000-0000-0000-000000000001',
    2026, 'Feb', 'Goal', 'Division Failed', 'Indicator', 'Not Achieved', 'carried_over',
    ARRAY['12000000-0000-0000-0000-000000000003'::uuid]
  );

SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.action_plans (
    company_id, department_code, division_id, year, month,
    goal_strategy, action_plan, indicator, status, submission_status,
    submitted_at, submitted_by, pic_ids
  ) VALUES (
    (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000002'),
    'FINAL', '22000000-0000-0000-0000-000000000001', 2026, 'Jan',
    'Goal', 'Forged Submitted Plan', 'Indicator', 'Achieved', 'submitted',
    now(), '12000000-0000-0000-0000-000000000002',
    ARRAY['12000000-0000-0000-0000-000000000002'::uuid]
  )$$,
  '42501',
  'ACTION_PLAN_FINALIZATION_RPC_REQUIRED',
  'feature-enabled direct submitted insert is rejected'
);
SELECT lives_ok(
  $$INSERT INTO public.action_plans (
    id, company_id, department_code, division_id, year, month,
    goal_strategy, action_plan, indicator, status, submission_status, pic_ids
  ) VALUES (
    '32000000-0000-0000-0000-000000000005',
    (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000002'),
    'FINAL', '22000000-0000-0000-0000-000000000001', 2026, 'Jan',
    'Goal', 'Valid Draft Plan', 'Indicator', 'Achieved', 'draft',
    ARRAY['12000000-0000-0000-0000-000000000002'::uuid]
  )$$,
  'feature-enabled draft insert remains allowed'
);
SELECT throws_ok(
  $$SELECT public.resolve_locked_rejected_plan(
    '32000000-0000-0000-0000-000000000005',
    '12000000-0000-0000-0000-000000000001',
    'drop'
  )$$,
  '42501',
  'AUTHENTICATION_REQUIRED',
  'legacy rejected-plan RPC rejects forged actor id'
);
SELECT throws_ok(
  $$SELECT public.resolve_locked_rejected_plan(
    '32000000-0000-0000-0000-000000000005',
    '12000000-0000-0000-0000-000000000002',
    'drop'
  )$$,
  '42501',
  'ATOMIC_FINALIZATION_RPC_REQUIRED',
  'legacy rejected-plan RPC cannot bypass feature-enabled finalization'
);
SELECT is(
  (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid = 'public.finalize_department_month(text,integer,text,text)'::regprocedure),
  'division_finalizer',
  'atomic finalizer has dedicated owner role'
);
SELECT is(
  has_function_privilege('anon', 'public.resolve_locked_rejected_plan(uuid,uuid,text)', 'EXECUTE'),
  false,
  'anonymous cannot invoke rejected-plan compatibility RPC'
);
SELECT is(
  (public.finalize_department_month('FINAL', 2026, 'Feb', NULL) ->> 'code'),
  'READINESS_REQUIRED',
  'REQUIRED blocks department leader when division readiness missing'
);
SELECT is(
  (SELECT count(*)::integer FROM public.action_plans WHERE submission_status = 'submitted'),
  0,
  'readiness block changes no plans'
);
SELECT is(
  (SELECT count(*)::integer FROM public.division_readiness_events WHERE event_type = 'FINALIZE_BLOCKED'),
  1,
  'readiness block persists audit event'
);
SELECT throws_ok(
  $$SELECT public.finalize_department_month('FINAL', 2026, 'Feb', 'leader override')$$,
  '42501',
  'OVERRIDE_ADMIN_REQUIRED',
  'department leader cannot override REQUIRED readiness'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.finalize_department_month('FINAL', 2026, 'Feb', '   ')$$,
  '22023',
  'OVERRIDE_REASON_REQUIRED',
  'admin override reason cannot be blank'
);
SELECT is(
  (public.finalize_department_month('FINAL', 2026, 'Feb', 'Approved exception') ->> 'code'),
  'FINALIZED',
  'admin valid override finalizes atomically'
);
SELECT is(
  (SELECT count(*)::integer FROM public.action_plans WHERE id IN ('32000000-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000002') AND submission_status = 'submitted'),
  2,
  'all original plans submitted together'
);
SELECT is(
  (SELECT quality_score FROM public.action_plans WHERE id = '32000000-0000-0000-0000-000000000002'),
  0,
  'Not Achieved plan auto-scores zero'
);
SELECT results_eq(
  $$SELECT division_id, recurring_group_id, origin_plan_id FROM public.action_plans WHERE origin_plan_id = '32000000-0000-0000-0000-000000000002'$$,
  $$VALUES (
    '22000000-0000-0000-0000-000000000001'::uuid,
    '42000000-0000-0000-0000-000000000001'::uuid,
    '32000000-0000-0000-0000-000000000002'::uuid
  )$$,
  'carry-over child preserves division recurring and origin ownership'
);
SELECT is(
  (SELECT count(*)::integer FROM public.action_plans WHERE origin_plan_id = '32000000-0000-0000-0000-000000000002'),
  1,
  'finalization creates only one live carry-over child'
);
SELECT is(
  (SELECT count(*)::integer FROM public.division_readiness_events WHERE event_type = 'FINALIZE_OVERRIDE'),
  1,
  'admin override event persists'
);
SELECT throws_ok(
  $$UPDATE public.action_plans SET submission_status = 'draft' WHERE id = '32000000-0000-0000-0000-000000000001'$$,
  '42501',
  'ACTION_PLAN_FINALIZATION_RPC_REQUIRED',
  'feature-enabled direct submission changes are rejected'
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '12000000-0000-0000-0000-000000000001', true);
UPDATE public.system_settings
SET division_readiness_policy = 'ADVISORY'
WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000001');

INSERT INTO public.action_plans (
  id, company_id, department_code, division_id, year, month,
  goal_strategy, action_plan, indicator, status, pic_ids
) VALUES (
  '32000000-0000-0000-0000-000000000003',
  (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000001'),
  'FINAL', '22000000-0000-0000-0000-000000000001', 2026, 'May',
  'Goal', 'Advisory Plan', 'Indicator', 'Achieved',
  ARRAY['12000000-0000-0000-0000-000000000003'::uuid]
);

SET LOCAL ROLE authenticated;
SELECT is(
  (public.finalize_department_month('FINAL', 2026, 'May', NULL) ->> 'code'),
  'FINALIZED',
  'ADVISORY finalizes without division readiness'
);
RESET ROLE;

UPDATE public.system_settings
SET carry_over_penalties = '[80]'::jsonb
WHERE company_id = (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000001');

INSERT INTO public.action_plans (
  id, company_id, department_code, division_id, year, month,
  goal_strategy, action_plan, indicator, status, resolution_type,
  carry_over_status, pic_ids
) VALUES (
  '32000000-0000-0000-0000-000000000004',
  (SELECT company_id FROM public.profiles WHERE id = '12000000-0000-0000-0000-000000000001'),
  'FINAL', '22000000-0000-0000-0000-000000000001', 2026, 'Apr',
  'Goal', 'Carry Failure', 'Indicator', 'Not Achieved', 'carried_over',
  'Late_Month_1', ARRAY['12000000-0000-0000-0000-000000000003'::uuid]
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.finalize_department_month('FINAL', 2026, 'Apr', NULL)$$,
  '23514',
  'CARRY_OVER_LIMIT_REACHED',
  'carry-over invariant failure aborts finalization'
);
SELECT is(
  (SELECT submission_status FROM public.action_plans WHERE id = '32000000-0000-0000-0000-000000000004'),
  'draft',
  'failed finalization leaves original plan draft'
);
SELECT is(
  (SELECT quality_score FROM public.action_plans WHERE id = '32000000-0000-0000-0000-000000000004'),
  NULL,
  'failed finalization leaves score unchanged'
);
SELECT is(
  (SELECT count(*)::integer FROM public.action_plans WHERE origin_plan_id = '32000000-0000-0000-0000-000000000004'),
  0,
  'failed finalization creates no carry-over child'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
