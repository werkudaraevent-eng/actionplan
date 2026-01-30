import { useState, useEffect, useCallback } from 'react';
import { supabase, withTimeout } from '../lib/supabase';
import { checkLockStatusServerSide } from '../utils/lockUtils';

// Helper to create audit log entry
async function createAuditLog(actionPlanId, userId, changeType, previousValue, newValue, description) {
  try {
    await supabase.from('audit_logs').insert({
      action_plan_id: actionPlanId,
      user_id: userId,
      change_type: changeType,
      previous_value: previousValue,
      new_value: newValue,
      description: description,
    });
  } catch (err) {
    console.error('Failed to create audit log:', err);
    // Don't throw - audit logging should not block the main operation
  }
}

// Utility for shortening long text
const truncateText = (text, maxLength = 30) => {
  if (!text) return 'Empty';
  const str = String(text);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
};

// Helper to generate detailed change description using config map (returns array)
function generateChangeDescription(original, updated) {
  if (!original) return ['Updated record details'];
  
  const changes = [];

  // Configuration: Map DB columns to Human Labels & Rules
  const fieldsToTrack = {
    // Dropdowns / Short Text
    month:         { label: 'Month', isLong: false },
    status:        { label: 'Status', isLong: false },
    pic:           { label: 'PIC', isLong: false },
    report_format: { label: 'Report Format', isLong: false },
    indicator:     { label: 'KPI', isLong: false },
    // Long Text / Areas
    goal_strategy: { label: 'Strategy', isLong: true },
    action_plan:   { label: 'Action Plan', isLong: true },
    outcome_link:  { label: 'Outcome/URL', isLong: true },
    remark:        { label: 'Remark', isLong: true },
  };

  // Loop through every field in the config
  Object.keys(fieldsToTrack).forEach((key) => {
    const config = fieldsToTrack[key];
    const oldVal = original[key];
    const newVal = updated[key];

    // Compare values (loose equality to handle null vs undefined vs "")
    if (oldVal != newVal) {
      let fromText = oldVal ? oldVal : 'Empty';
      let toText = newVal ? newVal : 'Empty';

      // Apply truncation if it's a long field
      if (config.isLong) {
        fromText = truncateText(fromText);
        toText = truncateText(toText);
      }

      changes.push(`Changed ${config.label} from '${fromText}' to '${toText}'`);
    }
  });

  if (changes.length === 0) return ['Updated record (No specific changes detected)'];
  return changes; // Return array, don't join
}

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
        .select('*')
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
    
    // Audit log
    const userId = await getCurrentUserId();
    if (userId) {
      await createAuditLog(
        data.id,
        userId,
        'CREATED',
        null,
        planData,
        `Created action plan: "${planData.action_plan?.substring(0, 50)}..."`
      );
    }
    
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
    
    // Audit log for each created plan
    const userId = await getCurrentUserId();
    if (userId && data) {
      for (const plan of data) {
        await createAuditLog(
          plan.id,
          userId,
          'CREATED',
          null,
          { ...plan, bulk_created: true },
          `Created action plan (bulk): "${plan.action_plan?.substring(0, 50)}..." for ${plan.month}`
        );
      }
    }
    
    return data;
  };

  // Update plan with detailed audit logging
  const updatePlan = async (id, updates, previousData = null, skipLockCheck = false) => {
    // Get previous data from state if not provided
    const original = previousData || plans.find((p) => p.id === id);
    
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
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates, updated_at: new Date().toISOString() } : p))
    );

    try {
      const { data, error } = await supabase
        .from('action_plans')
        .update(updates)
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

      // Audit log with detailed change description
      const userId = await getCurrentUserId();
      if (userId) {
        // Determine change type with PRIORITY logic for hierarchical workflow
        let changeType = 'FULL_UPDATE';
        const updateKeys = Object.keys(updates);
        
        // Check for status change first (highest priority)
        const oldStatus = original?.status;
        const newStatus = updates.status;
        const statusChanged = newStatus !== undefined && newStatus !== oldStatus;
        
        if (statusChanged) {
          // Priority 1: Staff marked ready for Leader (Internal Review)
          if (newStatus === 'Internal Review' && oldStatus !== 'Internal Review') {
            changeType = 'MARKED_READY';
          }
          // Priority 2: Leader submitted to Admin (Waiting Approval)
          else if (newStatus === 'Waiting Approval' && oldStatus !== 'Waiting Approval') {
            changeType = 'SUBMITTED_FOR_REVIEW';
          }
          // Priority 3: Approved (Admin approved the submission)
          else if (newStatus === 'Achieved' && oldStatus === 'Waiting Approval') {
            changeType = 'APPROVED';
          }
          // Priority 4: Rejected by Admin (sent back for revision)
          else if (oldStatus === 'Waiting Approval' && newStatus !== 'Achieved') {
            changeType = 'REJECTED';
          }
          // Priority 5: Leader sent back to staff (from Internal Review)
          else if (oldStatus === 'Internal Review' && (newStatus === 'On Progress' || newStatus === 'Open')) {
            changeType = 'REJECTED';
          }
          // Priority 6: Generic status change
          else {
            changeType = 'STATUS_UPDATE';
          }
        } else if (updateKeys.length === 1) {
          // Single field updates (no status change)
          if (updates.remark !== undefined) changeType = 'REMARK_UPDATE';
          else if (updates.outcome_link !== undefined) changeType = 'OUTCOME_UPDATE';
        }

        // Generate detailed description (returns array)
        const mergedUpdate = { ...original, ...updates };
        const descriptionArray = generateChangeDescription(original, mergedUpdate);

        await createAuditLog(
          id,
          userId,
          changeType,
          original,
          updates,
          JSON.stringify(descriptionArray) // Store as JSON array
        );
      }

      return data;
    } catch (err) {
      console.error('Update failed:', err);
      throw err;
    }
  };

  // Soft delete plan with audit logging and deletion reason
  const deletePlan = async (id, deletionReason = null) => {
    const planToDelete = plans.find((p) => p.id === id);
    
    // Optimistic update - remove from active list
    setPlans((prev) => prev.filter((p) => p.id !== id));

    try {
      const { id: userId, name: userName } = await getCurrentUser();
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

      // Audit log (using DELETED as change_type for DB constraint compatibility)
      if (userId && planToDelete) {
        await createAuditLog(
          id,
          userId,
          'DELETED',
          planToDelete,
          { deleted_at: deletedAt, deleted_by: userName, deletion_reason: deletionReason },
          `Soft deleted action plan: "${planToDelete.action_plan?.substring(0, 50)}..." by ${userName}. Reason: ${deletionReason || 'Not specified'}`
        );
      }
    } catch (err) {
      console.error('Delete failed:', err);
      throw err;
    }
  };

  // Restore soft-deleted plan
  const restorePlan = async (id) => {
    try {
      const userId = await getCurrentUserId();
      
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

      // Audit log (using STATUS_UPDATE as change_type for DB constraint compatibility)
      if (userId) {
        await createAuditLog(
          id,
          userId,
          'STATUS_UPDATE',
          { deleted_at: data.deleted_at },
          { restored: true },
          `Restored action plan: "${data.action_plan?.substring(0, 50)}..."`
        );
      }

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
    const userId = await getCurrentUserId();
    
    // Get plan info before deletion
    const { data: planToDelete } = await supabase
      .from('action_plans')
      .select('*')
      .eq('id', id)
      .single();

    // Audit log before permanent delete (using DELETED as change_type for DB constraint compatibility)
    if (userId && planToDelete) {
      await createAuditLog(
        id,
        userId,
        'DELETED',
        planToDelete,
        { permanently_deleted: true },
        `Permanently deleted action plan: "${planToDelete.action_plan?.substring(0, 50)}..."`
      );
    }

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
      
      const { error } = await supabase
        .from('action_plans')
        .update(updatePayload)
        .eq('id', id);

      if (error) {
        await fetchPlans();
        throw error;
      }

      // Audit log with priority-based change type
      const userId = await getCurrentUserId();
      if (userId) {
        // Determine change type with PRIORITY logic
        let changeType = 'STATUS_UPDATE';
        
        // Priority 1: Staff marked ready for Leader (Internal Review)
        if (status === 'Internal Review' && previousStatus !== 'Internal Review') {
          changeType = 'MARKED_READY';
        }
        // Priority 2: Submitted for Review
        else if (status === 'Waiting Approval' && previousStatus !== 'Waiting Approval') {
          changeType = 'SUBMITTED_FOR_REVIEW';
        }
        // Priority 3: Approved (Admin approved the submission)
        else if (status === 'Achieved' && previousStatus === 'Waiting Approval') {
          changeType = 'APPROVED';
        }
        // Priority 4: Rejected (Admin sent back for revision)
        else if (previousStatus === 'Waiting Approval' && status !== 'Achieved') {
          changeType = 'REJECTED';
        }
        
        await createAuditLog(
          id,
          userId,
          changeType,
          { status: previousStatus },
          updatePayload,
          `Changed status from "${previousStatus}" to "${status}"${shouldClearLeaderFeedback ? ' (cleared leader feedback)' : ''}`
        );
      }
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

      // Create audit logs for each item (using STATUS_UPDATE as change_type for DB constraint compatibility)
      if (userId) {
        // Audit logs for Achieved items
        for (const item of achievedItems) {
          await createAuditLog(
            item.id,
            userId,
            'STATUS_UPDATE',
            { submission_status: 'draft' },
            { submission_status: 'submitted', submitted_at: submittedAt },
            `Report finalized for ${month} by ${userName} - item locked for Management grading`
          );
        }
        
        // Audit logs for Not Achieved items (with auto-score note)
        for (const item of failedItems) {
          await createAuditLog(
            item.id,
            userId,
            'STATUS_UPDATE',
            { submission_status: 'draft', quality_score: null },
            { submission_status: 'submitted', submitted_at: submittedAt, quality_score: 0 },
            `Report finalized for ${month} by ${userName} - auto-scored 0 (Not Achieved)`
          );
        }
      }

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

      // Audit log (using STATUS_UPDATE as change_type for DB constraint compatibility)
      const userId = await getCurrentUserId();
      if (userId) {
        const previousValue = { submission_status: 'submitted' };
        const newValue = { submission_status: 'draft' };
        
        // Include score info in audit if auto-grade was cleared
        if (isAutoGradedNotAchieved) {
          previousValue.quality_score = 0;
          newValue.quality_score = null;
        }
        
        await createAuditLog(
          id,
          userId,
          'STATUS_UPDATE',
          previousValue,
          newValue,
          isAutoGradedNotAchieved 
            ? `Item unlocked for editing (auto-grade cleared for re-evaluation)`
            : `Item unlocked for editing`
        );
      }
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

      // Create audit logs for each recalled item
      if (userId) {
        for (const item of ungradedItems) {
          await createAuditLog(
            item.id,
            userId,
            'STATUS_UPDATE',
            { submission_status: 'submitted' },
            { submission_status: 'draft' },
            `Report recalled for ${month} by ${userName} - item unlocked for editing`
          );
        }
        
        for (const item of autoGradedItems) {
          await createAuditLog(
            item.id,
            userId,
            'STATUS_UPDATE',
            { submission_status: 'submitted', quality_score: 0 },
            { submission_status: 'draft', quality_score: null },
            `Report recalled for ${month} by ${userName} - auto-grade cleared for re-evaluation`
          );
        }
      }

      return itemsToRecall.length;
    } catch (err) {
      console.error('Recall report failed:', err);
      throw err;
    }
  };

  // Grade a plan with race condition protection
  // Only grades if the item is still in 'submitted' status (prevents zombie grading)
  const gradePlan = async (id, gradeData) => {
    const original = plans.find((p) => p.id === id);
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...gradeData, updated_at: new Date().toISOString() } : p))
    );

    try {
      // CRITICAL GUARD: Only update if submission_status is still 'submitted'
      // This prevents "zombie grading" when a Leader recalls while Admin is grading
      const { data, error } = await supabase
        .from('action_plans')
        .update(gradeData)
        .eq('id', id)
        .eq('submission_status', 'submitted') // <-- Race condition guard
        .select();

      if (error) {
        await fetchPlans();
        throw error;
      }

      // Check if the update actually happened (data will be empty if condition failed)
      if (!data || data.length === 0) {
        // Item was recalled - rollback optimistic update and throw specific error
        await fetchPlans();
        const recalledError = new Error('ITEM_RECALLED');
        recalledError.code = 'ITEM_RECALLED';
        recalledError.message = 'This item has been RECALLED by the department. The grade was not saved.';
        throw recalledError;
      }

      // Update succeeded
      setPlans((prev) =>
        prev.map((p) => (p.id === id ? data[0] : p))
      );

      // Audit log
      const userId = await getCurrentUserId();
      if (userId) {
        const isApproval = gradeData.quality_score != null;
        const isRevisionRequest = gradeData.status === 'On Progress' && gradeData.submission_status === 'draft';
        
        // Determine action type
        let actionType = 'APPROVED';
        let description = `Graded with score ${gradeData.quality_score}%`;
        
        if (isRevisionRequest) {
          actionType = 'REVISION_REQUESTED';
          description = `Returned for revision. Reason: "${gradeData.admin_feedback || 'No reason provided'}"`;
        } else if (!isApproval) {
          actionType = 'REJECTED';
          description = `Rejected: ${gradeData.admin_feedback?.substring(0, 100) || 'No feedback'}`;
        }
        
        await createAuditLog(
          id,
          userId,
          actionType,
          { 
            quality_score: original?.quality_score, 
            status: original?.status,
            submission_status: original?.submission_status 
          },
          { 
            quality_score: gradeData.quality_score,
            status: gradeData.status,
            submission_status: gradeData.submission_status,
            admin_feedback: gradeData.admin_feedback
          },
          description
        );
      }

      return data[0];
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
    
    const { id: userId, name: userName } = await getCurrentUser();
    
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

      // Audit log with GRADE_RESET type
      if (userId) {
        await createAuditLog(
          id,
          userId,
          'GRADE_RESET',
          { 
            quality_score: original.quality_score, 
            status: original.status,
            submission_status: original.submission_status,
            outcome_link: original.outcome_link,
            remark: original.remark,
            admin_feedback: original.admin_feedback
          },
          resetData,
          `Assessment cleared by ${userName} - score (${original.quality_score}), evidence, and remarks wiped`
        );
      }

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

      // Create audit logs for each reset item with GRADE_RESET type
      if (userId) {
        for (const item of gradedItems) {
          await createAuditLog(
            item.id,
            userId,
            'GRADE_RESET',
            { 
              quality_score: item.quality_score, 
              status: item.status,
              submission_status: item.submission_status,
              outcome_link: item.outcome_link,
              remark: item.remark
            },
            { 
              quality_score: null, 
              status: 'Open',
              submission_status: 'draft',
              outcome_link: null,
              remark: null
            },
            `Bulk reset by ${userName} - score (${item.quality_score}), evidence, and remarks cleared`
          );
        }
      }

      return gradedItems.length;
    } catch (err) {
      console.error('Bulk reset failed:', err);
      throw err;
    }
  };

  // Approve unlock request (Admin only)
  // Sets unlock_status to 'approved' and optionally sets an expiry date
  const approveUnlockRequest = async (id, approvalDurationDays = 7) => {
    const original = plans.find((p) => p.id === id);
    if (!original) throw new Error('Plan not found');
    
    const { id: userId, name: userName } = await getCurrentUser();
    const approvedAt = new Date().toISOString();
    const approvedUntil = new Date(Date.now() + approvalDurationDays * 24 * 60 * 60 * 1000).toISOString();
    
    const updateData = {
      unlock_status: 'approved',
      unlock_approved_by: userId,
      unlock_approved_at: approvedAt,
      approved_until: approvedUntil
    };
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updateData, updated_at: new Date().toISOString() } : p))
    );

    try {
      const { data, error } = await supabase
        .from('action_plans')
        .update(updateData)
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

      // Audit log for unlock approval
      if (userId) {
        await createAuditLog(
          id,
          userId,
          'UNLOCK_APPROVED',
          { 
            unlock_status: original.unlock_status,
            unlock_reason: original.unlock_reason
          },
          { 
            unlock_status: 'approved',
            approved_until: approvedUntil
          },
          `Unlock approved by ${userName}. Plan editable until ${new Date(approvedUntil).toLocaleDateString()}. Original reason: "${original.unlock_reason || 'Not specified'}"`
        );
      }

      return data;
    } catch (err) {
      console.error('Approve unlock failed:', err);
      throw err;
    }
  };

  // Reject unlock request (Admin only)
  const rejectUnlockRequest = async (id, rejectionReason = '') => {
    const original = plans.find((p) => p.id === id);
    if (!original) throw new Error('Plan not found');
    
    const { id: userId, name: userName } = await getCurrentUser();
    
    const updateData = {
      unlock_status: 'rejected',
      unlock_approved_by: userId,
      unlock_approved_at: new Date().toISOString(),
      approved_until: null
    };
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updateData, updated_at: new Date().toISOString() } : p))
    );

    try {
      const { data, error } = await supabase
        .from('action_plans')
        .update(updateData)
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

      // Audit log for unlock rejection
      if (userId) {
        await createAuditLog(
          id,
          userId,
          'UNLOCK_REJECTED',
          { 
            unlock_status: original.unlock_status,
            unlock_reason: original.unlock_reason
          },
          { 
            unlock_status: 'rejected'
          },
          `Unlock rejected by ${userName}. ${rejectionReason ? `Reason: "${rejectionReason}"` : 'No reason provided.'} Original request: "${original.unlock_reason || 'Not specified'}"`
        );
      }

      return data;
    } catch (err) {
      console.error('Reject unlock failed:', err);
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
