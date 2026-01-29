CREATE OR REPLACE FUNCTION reset_simulation_data()
RETURNS void AS $$
BEGIN
  UPDATE action_plans
  SET 
    -- 1. Reset Status Utama kembali ke Awal
    status = 'Open',
    
    -- 2. Bersihkan Remark & Alasan
    remark = NULL,
    specify_reason = NULL,
    
    -- 3. Bersihkan Siklus Lock/Unlock (Gembok)
    unlock_status = NULL,
    unlock_reason = NULL,
    unlock_rejection_reason = NULL,
    unlock_requested_at = NULL,
    unlock_requested_by = NULL,
    unlock_approved_at = NULL,
    unlock_approved_by = NULL,
    approved_until = NULL,
    
    -- 4. Bersihkan Evidence & Penilaian
    evidence = NULL,
    quality_score = NULL,
    leader_feedback = NULL,
    admin_feedback = NULL,
    reviewed_by = NULL,
    reviewed_at = NULL,
    
    -- 5. Reset submission status
    submission_status = 'draft',
    submitted_at = NULL,
    submitted_by = NULL,
    
    -- 6. Update timestamp
    updated_at = NOW()
    
  WHERE deleted_at IS NULL; -- Hanya reset data yang belum dihapus
END;
$$ LANGUAGE plpgsql
SECURITY DEFINER;;
