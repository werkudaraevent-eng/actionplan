-- ============================================================================
-- Migration: Granular Drop Requests
-- Description: Per-priority drop approval settings, drop_requests table,
--              is_drop_pending flag, and RPCs for submit/approve/reject.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add per-priority drop approval columns to system_settings
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS drop_approval_req_uh BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS drop_approval_req_h  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS drop_approval_req_m  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS drop_approval_req_l  BOOLEAN DEFAULT FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add is_drop_pending flag to action_plans
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.action_plans
  ADD COLUMN IF NOT EXISTS is_drop_pending BOOLEAN DEFAULT FALSE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Create drop_requests table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.drop_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     UUID NOT NULL REFERENCES public.action_plans(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id),
  reason      TEXT NOT NULL CHECK (length(trim(reason)) >= 5),
  status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id)
);

-- Index for fast lookups by plan and by status
CREATE INDEX IF NOT EXISTS idx_drop_requests_plan_id ON public.drop_requests(plan_id);
CREATE INDEX IF NOT EXISTS idx_drop_requests_status  ON public.drop_requests(status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS for drop_requests
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.drop_requests ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read drop requests
CREATE POLICY "Authenticated users can read drop_requests"
  ON public.drop_requests FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can insert their own drop requests
CREATE POLICY "Users can create their own drop_requests"
  ON public.drop_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only admins/executives can update drop requests (approve/reject)
CREATE POLICY "Admins can update drop_requests"
  ON public.drop_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND LOWER(profiles.role) IN ('admin', 'executive')
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. RPC: submit_drop_request
--    Called by Leader/Staff when dropping a plan that requires approval.
--    Inserts a pending request and flags the plan.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_drop_request(
  p_plan_id UUID,
  p_reason  TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request_id UUID;
  v_user_id UUID := auth.uid();
BEGIN
  -- Validate inputs
  IF p_plan_id IS NULL THEN
    RAISE EXCEPTION 'plan_id is required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Reason must be at least 5 characters';
  END IF;

  -- Check plan exists and is not already pending
  IF NOT EXISTS (SELECT 1 FROM action_plans WHERE id = p_plan_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Action plan not found';
  END IF;
  IF EXISTS (SELECT 1 FROM action_plans WHERE id = p_plan_id AND is_drop_pending = TRUE) THEN
    RAISE EXCEPTION 'A drop request is already pending for this plan';
  END IF;

  -- Check no other PENDING request exists for this plan
  IF EXISTS (SELECT 1 FROM drop_requests WHERE plan_id = p_plan_id AND status = 'PENDING') THEN
    RAISE EXCEPTION 'A drop request is already pending for this plan';
  END IF;

  -- Insert the request
  INSERT INTO drop_requests (plan_id, user_id, reason)
  VALUES (p_plan_id, v_user_id, trim(p_reason))
  RETURNING id INTO v_request_id;

  -- Flag the action plan as drop-pending
  UPDATE action_plans
  SET is_drop_pending = TRUE
  WHERE id = p_plan_id;

  RETURN v_request_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. RPC: approve_drop_request
--    Called by Admin/Executive. Drops the plan (Not Achieved, score 0).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_drop_request(
  p_request_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id  UUID := auth.uid();
  v_plan_id   UUID;
  v_reason    TEXT;
  v_req_status TEXT;
BEGIN
  -- Fetch the request
  SELECT plan_id, reason, status
  INTO v_plan_id, v_reason, v_req_status
  FROM drop_requests
  WHERE id = p_request_id;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Drop request not found';
  END IF;
  IF v_req_status <> 'PENDING' THEN
    RAISE EXCEPTION 'This request has already been processed (status: %)', v_req_status;
  END IF;

  -- Verify caller is admin or executive
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND LOWER(role) IN ('admin', 'executive')
  ) THEN
    RAISE EXCEPTION 'Only Admin or Executive can approve drop requests';
  END IF;

  -- 1. Update the drop request
  UPDATE drop_requests
  SET status = 'APPROVED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE id = p_request_id;

  -- 2. Update the action plan: Not Achieved, score 0, clear pending flag
  UPDATE action_plans
  SET status = 'Not Achieved',
      quality_score = 0,
      is_drop_pending = FALSE,
      remark = CASE
        WHEN remark IS NOT NULL AND trim(remark) <> ''
        THEN remark || E'\n[DROPPED via Approval: ' || v_reason || ']'
        ELSE '[DROPPED via Approval: ' || v_reason || ']'
      END
  WHERE id = v_plan_id;

  -- 3. Create notification for the requester
  INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
  SELECT
    dr.user_id,
    'STATUS_CHANGE',
    'Drop Request Approved',
    'Your drop request has been approved. The plan has been marked as Not Achieved.',
    'ACTION_PLAN',
    v_plan_id
  FROM drop_requests dr
  WHERE dr.id = p_request_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RPC: reject_drop_request
--    Called by Admin/Executive. Rejects the drop → plan goes back to Open.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_drop_request(
  p_request_id UUID,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id   UUID := auth.uid();
  v_plan_id    UUID;
  v_req_status TEXT;
BEGIN
  -- Fetch the request
  SELECT plan_id, status
  INTO v_plan_id, v_req_status
  FROM drop_requests
  WHERE id = p_request_id;

  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'Drop request not found';
  END IF;
  IF v_req_status <> 'PENDING' THEN
    RAISE EXCEPTION 'This request has already been processed (status: %)', v_req_status;
  END IF;

  -- Verify caller is admin or executive
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = v_admin_id
    AND LOWER(role) IN ('admin', 'executive')
  ) THEN
    RAISE EXCEPTION 'Only Admin or Executive can reject drop requests';
  END IF;

  -- 1. Update the drop request
  UPDATE drop_requests
  SET status = 'REJECTED',
      reviewed_at = NOW(),
      reviewed_by = v_admin_id
  WHERE id = p_request_id;

  -- 2. Restore the action plan: back to Open, clear pending flag
  UPDATE action_plans
  SET status = 'Open',
      is_drop_pending = FALSE
  WHERE id = v_plan_id;

  -- 3. Create notification for the requester
  INSERT INTO notifications (user_id, type, title, message, resource_type, resource_id)
  SELECT
    dr.user_id,
    'STATUS_CHANGE',
    'Drop Request Rejected',
    CASE
      WHEN p_rejection_reason IS NOT NULL AND trim(p_rejection_reason) <> ''
      THEN 'Your drop request was rejected. Reason: ' || p_rejection_reason || '. The plan has been moved back to Open status.'
      ELSE 'Your drop request was rejected. The plan has been moved back to Open status and needs to be carried over.'
    END,
    'ACTION_PLAN',
    v_plan_id
  FROM drop_requests dr
  WHERE dr.id = p_request_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Grant execute permissions to authenticated users
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.submit_drop_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_drop_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_drop_request(UUID, TEXT) TO authenticated;
