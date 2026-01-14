import { useState, useEffect, useCallback } from 'react';
import { supabase, withTimeout } from '../lib/supabase';

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
        .order('created_at', { ascending: true });

      if (departmentCode) {
        query = query.eq('department_code', departmentCode);
      }

      const { data, error: fetchError } = await withTimeout(query, 10000);

      if (fetchError) throw fetchError;
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
  const updatePlan = async (id, updates, previousData = null) => {
    // Get previous data from state if not provided
    const original = previousData || plans.find((p) => p.id === id);
    
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
          else if (oldStatus === 'Internal Review' && (newStatus === 'On Progress' || newStatus === 'Pending')) {
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
      .order('deleted_at', { ascending: false });

    if (departmentCode) {
      query = query.eq('department_code', departmentCode);
    }

    const { data, error } = await query;
    if (error) throw error;
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
  const updateStatus = async (id, status) => {
    // Get previous data for audit log
    const previousPlan = plans.find((p) => p.id === id);
    const previousStatus = previousPlan?.status;
    
    // Determine if we need to clear leader_feedback (staff resubmitting after revision)
    const shouldClearLeaderFeedback = status === 'Internal Review' && previousPlan?.leader_feedback;
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { 
        ...p, 
        status,
        ...(shouldClearLeaderFeedback && { leader_feedback: null })
      } : p))
    );

    try {
      // Build update payload
      const updatePayload = { status };
      if (shouldClearLeaderFeedback) {
        updatePayload.leader_feedback = null;
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
  const unlockItem = async (id) => {
    const previousPlan = plans.find((p) => p.id === id);
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { 
        ...p, 
        submission_status: 'draft',
        submitted_at: null,
        submitted_by: null
      } : p))
    );

    try {
      const { error } = await supabase
        .from('action_plans')
        .update({ 
          submission_status: 'draft',
          submitted_at: null,
          submitted_by: null
        })
        .eq('id', id);

      if (error) {
        await fetchPlans();
        throw error;
      }

      // Audit log (using STATUS_UPDATE as change_type for DB constraint compatibility)
      const userId = await getCurrentUserId();
      if (userId) {
        await createAuditLog(
          id,
          userId,
          'STATUS_UPDATE',
          { submission_status: 'submitted' },
          { submission_status: 'draft' },
          `Item unlocked for editing`
        );
      }
    } catch (err) {
      console.error('Unlock failed:', err);
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
    unlockItem,
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
            .is('deleted_at', null), // Only count active items
          10000
        );

        if (error) throw error;

        const total = data?.length || 0;
        const achieved = data?.filter((p) => p.status === 'Achieved').length || 0;
        const inProgress = data?.filter((p) => p.status === 'On Progress').length || 0;
        const pending = data?.filter((p) => p.status === 'Pending').length || 0;
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
