-- Finishes the June 2026 restructure sweep.
-- Run in Supabase → SQL Editor. Ids verified 2026-08-28 against production.
--
-- Order matters: step 1 must commit before step 2. Closing the May chain while its June
-- child is still live makes handle_carry_over_reversal delete that child permanently.
-- After step 1 the child carries deleted_at, so the trigger finds nothing to remove.

BEGIN;

-- ── Step 1: soft-delete the last five pre-import June plans ────────────────
-- Created 2026-02-13 under the old structure, status Open, no result, no evidence,
-- no grade, not replaced by the 26-28 Aug import. Restorable from the department page.
UPDATE public.action_plans
SET deleted_at      = now(),
    deleted_by      = 'Admin',
    deletion_reason = '2026 Restructure'
WHERE id IN (
  '3c8d1ea0-6839-4511-9a60-d52569f35a7b',  -- HR  Jun  Penyusunan struktur organisasi di unit bisnis
  'e8437353-81c5-4674-a9fb-087e65b1b429',  -- SO  Jun  Training Grooming & Manner for SO Staff
  '9acd1dfd-7d3e-44d1-b220-0a5945b9746f',  -- SO  Jun  Membuat Rekap Penilaian Man Power Internal
  '782d7f88-6657-494e-a6f2-c11841db6f42',  -- SO  Jun  Rata-Rata pencapaian KPI Kerja Sales Operation 75%
  '542ec96a-a294-42c1-a9d4-6bb00549534d'   -- SS  Jun  Membuat prototype product (Werkudara Signature)
)
AND deleted_at IS NULL;

-- The audit trigger does not cover soft deletes, so the trail is written by hand —
-- same shape the Bulk Operations page writes.
INSERT INTO public.audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
SELECT id,
       'c5ede9b7-17ad-4a0e-968b-ee5fc5f4cd54',  -- Admin <hanungsastria13@gmail.com>
       'SOFT_DELETE',
       jsonb_build_object('status', status, 'deleted_at', NULL),
       jsonb_build_object('deleted_at', deleted_at, 'deletion_reason', '2026 Restructure'),
       'Deleted via bulk operation — 2026 Restructure'
FROM public.action_plans
WHERE id IN (
  '3c8d1ea0-6839-4511-9a60-d52569f35a7b',
  'e8437353-81c5-4674-a9fb-087e65b1b429',
  '9acd1dfd-7d3e-44d1-b220-0a5945b9746f',
  '782d7f88-6657-494e-a6f2-c11841db6f42',
  '542ec96a-a294-42c1-a9d4-6bb00549534d'
);

-- ── Step 2: close the one May chain whose June continuation is already gone ─
-- ACS "8.b. Meningkatkan Kecepatan Respon dan Closing Bisnis" stays Not Achieved and
-- keeps its score; only the handover marker is cleared so it stops waiting for a
-- continuation that will never arrive.
INSERT INTO public.audit_logs (action_plan_id, user_id, change_type, previous_value, new_value, description)
SELECT id,
       'c5ede9b7-17ad-4a0e-968b-ee5fc5f4cd54',
       'RESOLUTION_CHANGED',
       jsonb_build_object('resolution_type', resolution_type, 'carried_to_month', carried_to_month),
       jsonb_build_object('resolution_type', 'dropped', 'carried_to_month', NULL),
       'Chain closed in May — continuation removed by the 2026 Restructure sweep'
FROM public.action_plans
WHERE id = '29732618-2ba3-45b1-bc71-d1588a1488d7';

UPDATE public.action_plans
SET resolution_type  = 'dropped',
    carried_to_month = NULL
WHERE id = '29732618-2ba3-45b1-bc71-d1588a1488d7'
AND deleted_at IS NULL;

COMMIT;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- Expect: kept_jun_dec = 3 (BAS, GA, CFC), open_may_chains = 3 (the same three).
SELECT
  (SELECT count(*) FROM public.action_plans
     WHERE company_id = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31'
       AND year = 2026 AND month IN ('Jun','Jul','Aug','Sep','Oct','Nov','Dec')
       AND deleted_at IS NULL
       AND created_at::date < DATE '2026-08-26')                       AS kept_jun_dec,
  (SELECT count(*) FROM public.action_plans
     WHERE company_id = 'bac22ddf-8887-48ac-8297-a1b48e8b5c31'
       AND year = 2026 AND month = 'May'
       AND carried_to_month = 'Jun' AND resolution_type = 'carried_over'
       AND deleted_at IS NULL)                                          AS open_may_chains;
