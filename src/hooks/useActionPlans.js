import { useState, useEffect, useCallback } from 'react';
import { supabase, withTimeout } from '../lib/supabase';
import { checkLockStatusServerSide } from '../utils/lockUtils';

// NOTE: Manual audit logging has been REMOVED from frontend.
// The database trigger `log_action_plan_changes()` now handles ALL audit logging automatically.
// This ensures consistent, detailed logging without duplicates.
// See migration: enhanced_audit_trigger_super_detailed

export function useActionPlans(departmentCode = null) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchPlans = useCallback(async () => {
    if (!supabase) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('action_plans')
        .select('*, origin_plan:origin_plan_id(month)')
        .is('deleted_at', null) // Only fetch active (non-deleted) items
        .order('created_at', { ascending: false }) // CRITICAL: Newest first
        .range(0, 9999); // CRITICAL: Increase limit from default 1000 to 10,000

      if (departmentCode) {
        query = query.eq('department_code', departmentCode);
      }

      const { data, error: fetchError } = await withTimeout(query, 10000);

      if (fetchError) throw fetchError;
      
      console.log(`[useActionPlans] Fetched ${data?.length || 0} plans (department: ${departmentCode || 'ALL'})`);
      
      setPlans(data || []);
    } catch (err) {
      console.error('Error fetching plans:', err);
      setError(err.message);
      setPlans([]);
    } finally {
      setLoading(false);
    }
  }, [departmentCode]);

  useEffect(() => {
    fetchPlans();
  }, [fetchPlans]);

  // Real-time subscription
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('action_plans_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'action_plans',
          ...(departmentCode && { filter: `department_code=eq.${departmentCode}` }),
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Only add if not soft-deleted
            if (!payload.new.deleted_at) {
              setPlans((prev) => [...prev, payload.new]);
            }
          } else if (payload.eventType === 'UPDATE') {
            // If soft-deleted, remove from list; otherwise update
            if (payload.new.deleted_at) {
              setPlans((prev) => prev.filter((p) => p.id !== payload.new.id));
            } else {
              setPlans((prev) =>
                prev.map((p) => (p.id === payload.new.id ? payload.new : p))
              );
            }
          } else if (payload.eventType === 'DELETE') {
            setPlans((prev) => prev.filter((p) => p.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [departmentCode]);

  // Get current user ID and name
  const getCurrentUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { id: null, name: null };
    
    // Try to get name from profiles table
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();
    
    return { 
      id: user.id, 
      name: profile?.full_name || user.email || 'Unknown User' 
    };
  };

  // Legacy helper for backward compatibility
  const getCurrentUserId = async () => {
    const { id } = await getCurrentUser();
    return id;
  };

  // Create new plan with audit logging
  const createPlan = async (planData) => {
    const { data, error } = await supabase
      .from('action_plans')
      .insert([planData])
      .select()
      .single();

    if (error) throw error;
    
    // Optimistic update
    setPlans((prev) => [...prev, data]);
    
    // NOTE: Audit logging handled by DB trigger (CREATED)
    
    return data;
  };

  // Bulk create plans (for recurring tasks)
  const bulkCreatePlans = async (plansData) => {
    const { data, error } = await supabase
      .from('action_plans')
      .insert(plansData)
      .select();

    if (error) throw error;
    
    // Optimistic update
    setPlans((prev) => [...prev, ...data]);
    
    // NOTE: Audit logging handled by DB trigger (CREATED for each plan)
    
    return data;
  };

  // Update plan with detailed audit logging
  const updatePlan = async (id, updates, previousData = null, skipLockCheck = false) => {
    // Get previous data from state if not provided
    const original = previousData || plans.find((p) => p.id === id);
    
    // DEBUG: Log the update request
    console.log('[useActionPlans.updatePlan] Called with:', {
      id,
      updates,
      originalStatus: original?.status,
      skipLockCheck
    });
    
    // PRE-FLIGHT LOCK CHECK: Verify the plan is still editable before saving
    // This prevents stale state issues where admin updated deadlines after user loaded the page
    // Skip check for admin operations or when explicitly bypassed
    if (!skipLockCheck && original?.month && original?.year) {
      const lockStatus = await checkLockStatusServerSide(
        supabase,
        original.month,
        original.year || new Date().getFullYear(),
        original.unlock_status,
        original.approved_until
      );
      
      if (lockStatus.isLocked) {
        console.log('[useActionPlans.updatePlan] BLOCKED: Period is locked');
        const error = new Error('PERIOD_LOCKED');
        error.code = 'PERIOD_LOCKED';
        error.message = `⛔ Action Denied: The deadline for ${original.month} has passed or was updated by Admin. Please refresh the page.`;
        throw error;
      }
    }
    
    // SMART FEEDBACK CLEARING: When re-submitting after revision, clear old feedback
    // This prevents stale revision notes from appearing on successfully fixed items
    const isResubmittingAfterRevision = 
      updates.status === 'Achieved' && 
      (original?.status === 'On Progress' || original?.status === 'Open' || original?.status === 'Not Achieved') &&
      original?.admin_feedback; // Only clear if there was feedback
    
    if (isResubmittingAfterRevision) {
      updates.admin_feedback = null; // Clear the old revision feedback
    }
    
    // AUTO-RESOLVE BLOCKER: Clear blocker when task is completed (Achieved/Not Achieved)
    // A completed task cannot be blocked - this fixes the UX bug where "BLOCKED" badge persists
    const isCompletionStatus = updates.status === 'Achieved' || updates.status === 'Not Achieved';
    const shouldClearBlocker = isCompletionStatus && original?.is_blocked === true;
    
    if (shouldClearBlocker) {
      updates.is_blocked = false;
      updates.blocker_reason = null;
      console.log('[updatePlan] AUTO-RESOLVE: Clearing blocker (task completed with status:', updates.status, ')');
    }
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p))
    );

    try {
      console.log('[useActionPlans.updatePlan] Sending to Supabase:', { id, updates });
      
      const { data, error } = await supabase
        .from('action_plans')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[useActionPlans.updatePlan] Supabase error:', error);
        await fetchPlans();
        throw error;
      }

      console.log('[useActionPlans.updatePlan] Supabase success:', { 
        returnedStatus: data?.status,
        returnedId: data?.id 
      });

      setPlans((prev) =>
        prev.map((p) => (p.id === id ? data : p))
      );

      // NOTE: Audit logging handled by DB trigger (detailed field-level changes)

      return data;
    } catch (err) {
      console.error('[useActionPlans.updatePlan] Update failed:', err);
      throw err;
    }
  };

  // Soft delete plan with audit logging and deletion reason
  const deletePlan = async (id, deletionReason = null) => {
    const planToDelete = plans.find((p) => p.id === id);
    
    // Optimistic update - remove from active list
    setPlans((prev) => prev.filter((p) => p.id !== id));

    try {
      const { name: userName } = await getCurrentUser();
      const deletedAt = new Date().toISOString();
      
      // Soft delete: set deleted_at timestamp, deleted_by name, and deletion_reason
      const { error } = await supabase
        .from('action_plans')
        .update({ 
          deleted_at: deletedAt,
          deleted_by: userName,
          deletion_reason: deletionReason
        })
        .eq('id', id);

      if (error) {
        // Rollback optimistic update
        if (planToDelete) {
          setPlans((prev) => [...prev, planToDelete]);
        }
        throw error;
      }

      // NOTE: Audit logging handled by DB trigger (SOFT_DELETE not yet in trigger - keep manual for now)
      // TODO: Add SOFT_DELETE to trigger if needed
    } catch (err) {
      console.error('Delete failed:', err);
      throw err;
    }
  };

  // Restore soft-deleted plan
  const restorePlan = async (id) => {
    try {
      // Restore: set deleted_at to null
      const { data, error } = await supabase
        .from('action_plans')
        .update({ deleted_at: null })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Add back to active list
      setPlans((prev) => [...prev, data]);

      // NOTE: Audit logging handled by DB trigger (RESTORE not yet in trigger - keep manual for now)
      // TODO: Add RESTORE to trigger if needed

      return data;
    } catch (err) {
      console.error('Restore failed:', err);
      throw err;
    }
  };

  // Fetch deleted plans for recycle bin
  const fetchDeletedPlans = async () => {
    let query = supabase
      .from('action_plans')
      .select('*')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .range(0, 9999); // CRITICAL: Increase limit to 10,000

    if (departmentCode) {
      query = query.eq('department_code', departmentCode);
    }

    const { data, error } = await query;
    if (error) throw error;
    
    console.log(`[useActionPlans] Fetched ${data?.length || 0} deleted plans`);
    
    return data || [];
  };

  // Permanently delete (for admin cleanup if needed)
  const permanentlyDeletePlan = async (id) => {
    // NOTE: Permanent delete bypasses trigger since record is removed
    // This is intentional - we don't need audit trail for permanently deleted items
    const { error } = await supabase
      .from('action_plans')
      .delete()
      .eq('id', id);

    if (error) throw error;
  };

  // Quick status update with audit logging
  // Also clears leader_feedback when staff resubmits to Internal Review
  // AUTO-WIPE: Clears gap analysis fields, remark, and outcome_link when status changes FROM "Not Achieved" to something else
  const updateStatus = async (id, status) => {
    // Get previous data for audit log
    const previousPlan = plans.find((p) => p.id === id);
    const previousStatus = previousPlan?.status;
    
    // Determine if we need to clear leader_feedback (staff resubmitting after revision)
    const shouldClearLeaderFeedback = status === 'Internal Review' && previousPlan?.leader_feedback;
    
    // AUTO-WIPE: Clear all failure-related fields when transitioning FROM "Not Achieved" to any other status
    const shouldClearFailureData = previousStatus === 'Not Achieved' && status !== 'Not Achieved';
    
    // AUTO-RESOLVE BLOCKER: Clear blocker when task is completed (Achieved/Not Achieved)
    // A completed task cannot be blocked - this fixes the UX bug where "BLOCKED" badge persists on "Achieved" items
    const isCompletionStatus = status === 'Achieved' || status === 'Not Achieved';
    const shouldClearBlocker = isCompletionStatus && previousPlan?.is_blocked === true;
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { 
        ...p, 
        status,
        ...(shouldClearLeaderFeedback && { leader_feedback: null }),
        ...(shouldClearFailureData && { 
          // Failure data
          gap_category: null, 
          gap_analysis: null, 
          specify_reason: null,
          // Notes (clear auto-generated "[Cause: ...]" text)
          remark: null,
          // Evidence (clear since task is open again)
          outcome_link: null
        }),
        // AUTO-RESOLVE: Clear blocker on completion
        ...(shouldClearBlocker && {
          is_blocked: false,
          blocker_reason: null
        })
      } : p))
    );

    try {
      // Build update payload
      const updatePayload = { status };
      if (shouldClearLeaderFeedback) {
        updatePayload.leader_feedback = null;
      }
      
      // AUTO-WIPE: Include null values to clear ALL failure-related fields in DB
      if (shouldClearFailureData) {
        // Failure data
        updatePayload.gap_category = null;
        updatePayload.gap_analysis = null;
        updatePayload.specify_reason = null;
        // Notes (clear auto-generated "[Cause: ...]" text)
        updatePayload.remark = null;
        // Evidence (clear since task is open again)
        updatePayload.outcome_link = null;
        
        console.log('[updateStatus] AUTO-WIPE: Clearing failure data, remark, and outcome_link (status changed from Not Achieved to', status, ')');
      }
      
      // AUTO-RESOLVE BLOCKER: Clear blocker fields in DB when completing task
      if (shouldClearBlocker) {
        updatePayload.is_blocked = false;
        updatePayload.blocker_reason = null;
        
        console.log('[updateStatus] AUTO-RESOLVE: Clearing blocker (task completed with status:', status, ')');
      }
      
      const { error } = await supabase
        .from('action_plans')
        .update(updatePayload)
        .eq('id', id);

      if (error) {
        await fetchPlans();
        throw error;
      }

      // NOTE: Audit logging handled by DB trigger (STATUS_UPDATE with detailed field changes)
    } catch (err) {
      console.error('Status update failed:', err);
      throw err;
    }
  };

  // SIMPLIFIED WORKFLOW: Finalize month report
  // Locks all items for a month by setting submission_status = 'submitted'
  // Auto-scores "Not Achieved" items with 0 (they skip the grading queue)
  const finalizeMonthReport = async (month) => {
    const { id: userId, name: userName } = await getCurrentUser();
    
    // Find all draft items for this month (not yet submitted)
    const itemsToFinalize = plans.filter(
      p => p.month === month && (!p.submission_status || p.submission_status === 'draft')
    );
    
    if (itemsToFinalize.length === 0) {
      throw new Error('No items to finalize for this month');
    }

    const submittedAt = new Date().toISOString();
    
    // Split items into two groups: Achieved (needs grading) and Not Achieved (auto-score 0)
    const achievedItems = itemsToFinalize.filter(p => p.status === 'Achieved');
    const failedItems = itemsToFinalize.filter(p => p.status === 'Not Achieved');
    
    const achievedIds = achievedItems.map(p => p.id);
    const failedIds = failedItems.map(p => p.id);
    
    // Optimistic update - include auto-scoring for failed items
    setPlans((prev) =>
      prev.map((p) => {
        if (achievedIds.includes(p.id)) {
          return { 
            ...p, 
            submission_status: 'submitted',
            submitted_at: submittedAt,
            submitted_by: userId
          };
        }
        if (failedIds.includes(p.id)) {
          return { 
            ...p, 
            submission_status: 'submitted',
            submitted_at: submittedAt,
            submitted_by: userId,
            quality_score: 0,
            admin_feedback: 'System: Auto-graded (Not Achieved)'
          };
        }
        return p;
      })
    );

    try {
      // Batch update in database using Promise.all for parallel execution
      const updatePromises = [];
      
      // Batch 1: Achieved items - need Admin grading (quality_score = null)
      if (achievedIds.length > 0) {
        updatePromises.push(
          supabase
            .from('action_plans')
            .update({ 
              submission_status: 'submitted',
              submitted_at: submittedAt,
              submitted_by: userId
            })
            .in('id', achievedIds)
        );
      }
      
      // Batch 2: Not Achieved items - auto-score 0, skip grading queue
      if (failedIds.length > 0) {
        updatePromises.push(
          supabase
            .from('action_plans')
            .update({ 
              submission_status: 'submitted',
              submitted_at: submittedAt,
              submitted_by: userId,
              quality_score: 0,
              admin_feedback: 'System: Auto-graded (Not Achieved)'
            })
            .in('id', failedIds)
        );
      }
      
      const results = await Promise.all(updatePromises);
      
      // Check for errors
      for (const result of results) {
        if (result.error) {
          await fetchPlans();
          throw result.error;
        }
      }

      // NOTE: Audit logging handled by DB trigger (SUBMITTED_FOR_REVIEW with detailed changes)

      return itemsToFinalize.length;
    } catch (err) {
      console.error('Finalize report failed:', err);
      throw err;
    }
  };

  // Unlock a finalized item (Leader/Admin only)
  // Also clears auto-grade for "Not Achieved" items so they can be re-evaluated
  const unlockItem = async (id) => {
    const previousPlan = plans.find((p) => p.id === id);
    
    // Check if this is an auto-graded "Not Achieved" item
    const isAutoGradedNotAchieved = previousPlan?.quality_score === 0 && previousPlan?.status === 'Not Achieved';
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { 
        ...p, 
        submission_status: 'draft',
        submitted_at: null,
        submitted_by: null,
        // Clear auto-grade for Not Achieved items
        ...(isAutoGradedNotAchieved && {
          quality_score: null,
          admin_feedback: null
        })
      } : p))
    );

    try {
      const updateData = { 
        submission_status: 'draft',
        submitted_at: null,
        submitted_by: null,
        // Clear auto-grade for Not Achieved items
        ...(isAutoGradedNotAchieved && {
          quality_score: null,
          admin_feedback: null
        })
      };
      
      const { error } = await supabase
        .from('action_plans')
        .update(updateData)
        .eq('id', id);

      if (error) {
        await fetchPlans();
        throw error;
      }

      // NOTE: Audit logging handled by DB trigger (detailed submission_status change)
    } catch (err) {
      console.error('Unlock failed:', err);
      throw err;
    }
  };

  // Bulk recall: Unlock all finalized items for a month (only if none are graded)
  // Also handles auto-graded "Not Achieved" items (score 0)
  const recallMonthReport = async (month) => {
    const { id: userId, name: userName } = await getCurrentUser();
    
    // Find all submitted items for this month that are NOT manually graded
    // Include: ungraded items (quality_score == null) AND auto-graded Not Achieved (quality_score === 0)
    const itemsToRecall = plans.filter(
      p => p.month === month && 
           p.submission_status === 'submitted' && 
           (p.quality_score == null || (p.quality_score === 0 && p.status === 'Not Achieved'))
    );
    
    if (itemsToRecall.length === 0) {
      throw new Error('No items to recall for this month');
    }

    // Separate items by type for proper handling
    const ungradedItems = itemsToRecall.filter(p => p.quality_score == null);
    const autoGradedItems = itemsToRecall.filter(p => p.quality_score === 0 && p.status === 'Not Achieved');
    
    const ungradedIds = ungradedItems.map(p => p.id);
    const autoGradedIds = autoGradedItems.map(p => p.id);
    const allIds = itemsToRecall.map(p => p.id);
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => {
        if (ungradedIds.includes(p.id)) {
          return { 
            ...p, 
            submission_status: 'draft',
            submitted_at: null,
            submitted_by: null
          };
        }
        if (autoGradedIds.includes(p.id)) {
          return { 
            ...p, 
            submission_status: 'draft',
            submitted_at: null,
            submitted_by: null,
            quality_score: null,
            admin_feedback: null
          };
        }
        return p;
      })
    );

    try {
      const updatePromises = [];
      
      // Batch 1: Ungraded items - just reset submission status
      if (ungradedIds.length > 0) {
        updatePromises.push(
          supabase
            .from('action_plans')
            .update({ 
              submission_status: 'draft',
              submitted_at: null,
              submitted_by: null
            })
            .in('id', ungradedIds)
        );
      }
      
      // Batch 2: Auto-graded Not Achieved items - also clear the auto-grade
      if (autoGradedIds.length > 0) {
        updatePromises.push(
          supabase
            .from('action_plans')
            .update({ 
              submission_status: 'draft',
              submitted_at: null,
              submitted_by: null,
              quality_score: null,
              admin_feedback: null
            })
            .in('id', autoGradedIds)
        );
      }
      
      const results = await Promise.all(updatePromises);
      
      // Check for errors
      for (const result of results) {
        if (result.error) {
          await fetchPlans();
          throw result.error;
        }
      }

      // NOTE: Audit logging handled by DB trigger (detailed submission_status and score changes)

      return itemsToRecall.length;
    } catch (err) {
      console.error('Recall report failed:', err);
      throw err;
    }
  };

  // Grade a plan with race condition protection
  // Grade via RPC — server-side logic handles strict/flexible mode dynamically.
  // Race condition guard is built into the RPC (checks submission_status = 'submitted').
  // Revision requests (quality_score = null) bypass the RPC and do a direct update.
  const gradePlan = async (id, gradeData) => {
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...gradeData, updated_at: new Date().toISOString() } : p))
    );

    try {
      // REVISION PATH: quality_score is null → direct update (kickback to draft)
      if (gradeData.quality_score == null) {
        const { data, error } = await supabase
          .from('action_plans')
          .update(gradeData)
          .eq('id', id)
          .eq('submission_status', 'submitted')
          .select('*, origin_plan:origin_plan_id(month)');

        if (error) { await fetchPlans(); throw error; }
        if (!data || data.length === 0) {
          await fetchPlans();
          const recalledError = new Error('ITEM_RECALLED');
          recalledError.code = 'ITEM_RECALLED';
          recalledError.message = 'This item has been RECALLED by the department. The grade was not saved.';
          throw recalledError;
        }
        setPlans((prev) => prev.map((p) => (p.id === id ? data[0] : p)));
        return data[0];
      }

      // GRADING PATH: call RPC for dynamic strict/flexible logic
      const { data: result, error } = await withTimeout(
        supabase.rpc('grade_action_plan', {
          p_plan_id: id,
          p_input_score: gradeData.quality_score,
          p_status: gradeData.status || 'Achieved',
          p_admin_feedback: gradeData.admin_feedback || null,
          p_reviewed_by: gradeData.reviewed_by || null,
        }),
        10000
      );

      if (error) {
        await fetchPlans();
        if (error.message?.includes('recalled') || error.message?.includes('not in submitted status')) {
          const recalledError = new Error('ITEM_RECALLED');
          recalledError.code = 'ITEM_RECALLED';
          recalledError.message = 'This item has been RECALLED by the department. The grade was not saved.';
          throw recalledError;
        }
        throw error;
      }

      // Re-fetch the updated plan row to get the full object with joins
      const { data: updated } = await supabase
        .from('action_plans')
        .select('*, origin_plan:origin_plan_id(month)')
        .eq('id', id)
        .single();

      if (updated) {
        setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
        return { ...updated, _rpcResult: result };
      }

      // Fallback: apply RPC result optimistically
      setPlans((prev) =>
        prev.map((p) => (p.id === id ? {
          ...p,
          status: result.final_status,
          quality_score: result.final_score,
          admin_feedback: gradeData.admin_feedback,
          reviewed_by: gradeData.reviewed_by,
          reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } : p))
      );

      return result;
    } catch (err) {
      console.error('Grade failed:', err);
      throw err;
    }
  };

  // Reset a single plan (Admin only) - COMPLETE WIPE
  // Clears score, status, feedback, AND user submissions (outcome_link, remark)
  // Uses dedicated GRADE_RESET audit log type for proper history tracking
  const resetPlan = async (id) => {
    const original = plans.find((p) => p.id === id);
    if (!original) throw new Error('Plan not found');
    
    const resetData = {
      quality_score: null,
      status: 'Open',
      submission_status: 'draft',
      admin_feedback: null,
      reviewed_by: null,
      reviewed_at: null,
      outcome_link: null,
      remark: null
    };
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...resetData, updated_at: new Date().toISOString() } : p))
    );

    try {
      const { data, error } = await supabase
        .from('action_plans')
        .update(resetData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        await fetchPlans();
        throw error;
      }

      setPlans((prev) =>
        prev.map((p) => (p.id === id ? data : p))
      );

      // NOTE: Audit logging handled by DB trigger (GRADE_RESET with detailed changes)

      return data;
    } catch (err) {
      console.error('Reset plan failed:', err);
      throw err;
    }
  };

  // Bulk reset ALL graded items back to Pending (Admin only)
  // COMPLETE WIPE: Clears score, status, feedback, AND user submissions (outcome_link, remark)
  const bulkResetGrades = async () => {
    const { id: userId, name: userName } = await getCurrentUser();
    
    // Find all graded items (quality_score is not null)
    const gradedItems = plans.filter(p => p.quality_score != null);
    
    if (gradedItems.length === 0) {
      throw new Error('No graded items to reset');
    }

    const gradedIds = gradedItems.map(p => p.id);
    
    // Optimistic update - COMPLETE WIPE
    setPlans((prev) =>
      prev.map((p) => {
        if (gradedIds.includes(p.id)) {
          return { 
            ...p, 
            quality_score: null,
            status: 'Open',
            submission_status: 'draft',
            admin_feedback: null,
            reviewed_by: null,
            reviewed_at: null,
            outcome_link: null,  // WIPE evidence link
            remark: null         // WIPE staff remarks
          };
        }
        return p;
      })
    );

    try {
      const { error } = await supabase
        .from('action_plans')
        .update({ 
          quality_score: null,
          status: 'Open',
          submission_status: 'draft',
          admin_feedback: null,
          reviewed_by: null,
          reviewed_at: null,
          outcome_link: null,  // WIPE evidence link
          remark: null         // WIPE staff remarks
        })
        .not('quality_score', 'is', null);

      if (error) {
        await fetchPlans();
        throw error;
      }

      // NOTE: Audit logging handled by DB trigger (GRADE_RESET for each item)

      return gradedItems.length;
    } catch (err) {
      console.error('Bulk reset failed:', err);
      throw err;
    }
  };

  // Approve unlock request (Admin only)
  // Uses process_unlock_request RPC — admin specifies an expiry deadline
  const approveUnlockRequest = async (id, expiryDate = null) => {
    const original = plans.find((p) => p.id === id);
    if (!original) throw new Error('Plan not found');
    
    const { id: userId } = await getCurrentUser();

    // If no expiry provided, default to 7 days from now
    const expiry = expiryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? {
        ...p,
        unlock_status: 'approved',
        unlock_approved_by: userId,
        unlock_approved_at: new Date().toISOString(),
        approved_until: expiry,
        updated_at: new Date().toISOString()
      } : p))
    );

    try {
      const { data: result, error } = await withTimeout(
        supabase.rpc('process_unlock_request', {
          p_plan_id: id,
          p_action: 'APPROVE',
          p_admin_id: userId,
          p_expiry_date: expiry,
        }),
        10000
      );

      if (error) {
        await fetchPlans();
        throw error;
      }

      // Re-fetch the updated plan for full object
      const { data: updated } = await supabase
        .from('action_plans')
        .select('*, origin_plan:origin_plan_id(month)')
        .eq('id', id)
        .single();

      if (updated) {
        setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
        return updated;
      }

      return result;
    } catch (err) {
      console.error('Approve unlock failed:', err);
      throw err;
    }
  };

  // Reject unlock request (Admin only)
  // Uses process_unlock_request RPC — plan stays locked, forces resolution wizard
  const rejectUnlockRequest = async (id, rejectionReason = '') => {
    const original = plans.find((p) => p.id === id);
    if (!original) throw new Error('Plan not found');
    
    const { id: userId } = await getCurrentUser();
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? {
        ...p,
        unlock_status: 'rejected',
        unlock_approved_by: userId,
        unlock_approved_at: new Date().toISOString(),
        unlock_rejection_reason: rejectionReason,
        approved_until: null,
        updated_at: new Date().toISOString()
      } : p))
    );

    try {
      const { data: result, error } = await withTimeout(
        supabase.rpc('process_unlock_request', {
          p_plan_id: id,
          p_action: 'REJECT',
          p_admin_id: userId,
          p_rejection_reason: rejectionReason || null,
        }),
        10000
      );

      if (error) {
        await fetchPlans();
        throw error;
      }

      // Re-fetch the updated plan for full object
      const { data: updated } = await supabase
        .from('action_plans')
        .select('*, origin_plan:origin_plan_id(month)')
        .eq('id', id)
        .single();

      if (updated) {
        setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
        return updated;
      }

      return result;
    } catch (err) {
      console.error('Reject unlock failed:', err);
      throw err;
    }
  };

  // Revoke an active unlock (Admin only)
  // Uses revoke_unlock_access RPC — immediately re-locks the plan
  const revokeUnlockAccess = async (id) => {
    const original = plans.find((p) => p.id === id);
    if (!original) throw new Error('Plan not found');
    
    const { id: userId } = await getCurrentUser();
    
    // Optimistic update — clear all unlock fields
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? {
        ...p,
        unlock_status: null,
        unlock_approved_by: null,
        unlock_approved_at: null,
        approved_until: null,
        unlock_requested_by: null,
        unlock_requested_at: null,
        unlock_reason: null,
        unlock_rejection_reason: null,
        updated_at: new Date().toISOString()
      } : p))
    );

    try {
      const { data: result, error } = await withTimeout(
        supabase.rpc('revoke_unlock_access', {
          p_plan_id: id,
          p_admin_id: userId,
        }),
        10000
      );

      if (error) {
        await fetchPlans();
        throw error;
      }

      // Re-fetch the updated plan for full object
      const { data: updated } = await supabase
        .from('action_plans')
        .select('*, origin_plan:origin_plan_id(month)')
        .eq('id', id)
        .single();

      if (updated) {
        setPlans((prev) => prev.map((p) => (p.id === id ? updated : p)));
        return updated;
      }

      return result;
    } catch (err) {
      console.error('Revoke unlock failed:', err);
      throw err;
    }
  };

  return {
    plans,
    setPlans,
    loading,
    error,
    refetch: fetchPlans,
    createPlan,
    bulkCreatePlans,
    updatePlan,
    deletePlan,
    restorePlan,
    fetchDeletedPlans,
    permanentlyDeletePlan,
    updateStatus,
    finalizeMonthReport,
    recallMonthReport,
    unlockItem,
    gradePlan,
    resetPlan,
    bulkResetGrades,
    approveUnlockRequest,
    rejectUnlockRequest,
    revokeUnlockAccess,
  };
}

export function useAggregatedStats() {
  const [stats, setStats] = useState({
    total: 0,
    achieved: 0,
    inProgress: 0,
    pending: 0,
    notAchieved: 0,
    byDepartment: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from('action_plans')
            .select('department_code, status')
            .is('deleted_at', null) // Only count active items
            .range(0, 9999), // CRITICAL: Increase limit to 10,000
          10000
        );

        if (error) throw error;

        console.log(`[useAggregatedStats] Fetched ${data?.length || 0} plans for stats`);

        const total = data?.length || 0;
        const achieved = data?.filter((p) => p.status === 'Achieved').length || 0;
        const inProgress = data?.filter((p) => p.status === 'On Progress').length || 0;
        const pending = data?.filter((p) => p.status === 'Open').length || 0;
        const notAchieved = data?.filter((p) => p.status === 'Not Achieved').length || 0;

        const deptMap = {};
        data?.forEach((plan) => {
          if (!deptMap[plan.department_code]) {
            deptMap[plan.department_code] = { total: 0, achieved: 0 };
          }
          deptMap[plan.department_code].total++;
          if (plan.status === 'Achieved') {
            deptMap[plan.department_code].achieved++;
          }
        });

        const byDepartment = Object.entries(deptMap)
          .map(([code, stats]) => ({
            code,
            total: stats.total,
            achieved: stats.achieved,
            rate: stats.total > 0 ? ((stats.achieved / stats.total) * 100).toFixed(1) : 0,
          }))
          .sort((a, b) => parseFloat(b.rate) - parseFloat(a.rate));

        setStats({ total, achieved, inProgress, pending, notAchieved, byDepartment });
      } catch (err) {
        console.error('Error fetching stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();

    const channel = supabase
      .channel('stats_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'action_plans' },
        () => fetchStats()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  return { stats, loading };
}
