-- ============================================================================
-- BACKFILL: Heal Admin Carry-Over Parents via Audit Log Proof
-- ============================================================================
-- STRATEGY: Use audit_logs with change_type = 'CARRY_OVER' as forensic proof.
-- GUARD:    Only target rows where resolution_type IS NULL (never overwrite
--           rows that already have a defined resolution like 'dropped').
-- ============================================================================


-- ═══════════════════════════════════════════════════════════════════
-- STEP 1: DRY RUN — Preview affected rows (RUN THIS FIRST)
-- ═══════════════════════════════════════════════════════════════════

SELECT
  ap.id,
  ap.department_code,
  ap.month,
  ap.year,
  ap.status,
  ap.resolution_type       AS current_resolution_type,
  ap.is_carry_over         AS current_is_carry_over,
  ap.carried_to_month      AS current_carried_to_month,
  al.new_value ->> 'carried_to_month'   AS audit_carried_to_month,
  al.new_value ->> 'carried_to_plan_id' AS audit_child_plan_id,
  al.description           AS audit_description,
  al.created_at            AS carry_over_timestamp,
  al.user_id               AS carried_over_by,
  LEFT(ap.action_plan, 80) AS action_plan_preview
FROM action_plans ap
INNER JOIN audit_logs al
  ON  al.action_plan_id = ap.id
  AND al.change_type    = 'CARRY_OVER'
WHERE ap.status            = 'Not Achieved'
  AND ap.deleted_at        IS NULL
  AND ap.resolution_type   IS NULL
ORDER BY ap.year DESC, ap.month, ap.department_code;


-- ═══════════════════════════════════════════════════════════════════
-- STEP 2: HEAL — Update parent rows (UNCOMMENT AFTER VERIFYING)
-- ═══════════════════════════════════════════════════════════════════

-- WITH carry_over_proof AS (
--   SELECT DISTINCT ON (al.action_plan_id)
--     al.action_plan_id,
--     al.new_value ->> 'carried_to_month' AS carried_to_month
--   FROM audit_logs al
--   WHERE al.change_type = 'CARRY_OVER'
--   ORDER BY al.action_plan_id, al.created_at DESC
-- )
-- UPDATE action_plans ap
-- SET
--   resolution_type  = 'carried_over',
--   is_carry_over    = TRUE,
--   carried_to_month = COALESCE(proof.carried_to_month, ap.carried_to_month),
--   updated_at       = NOW()
-- FROM carry_over_proof proof
-- WHERE proof.action_plan_id = ap.id
--   AND ap.status            = 'Not Achieved'
--   AND ap.deleted_at        IS NULL
--   AND ap.resolution_type   IS NULL;
