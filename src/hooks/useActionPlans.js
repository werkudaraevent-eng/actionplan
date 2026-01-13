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

  // Update plan with audit logging
  const updatePlan = async (id, updates, previousData = null) => {
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

      // Audit log
      const userId = await getCurrentUserId();
      if (userId) {
        // Determine change type and description
        let changeType = 'FULL_UPDATE';
        let description = 'Updated action plan';
        
        if (Object.keys(updates).length === 1) {
          if (updates.status) {
            changeType = 'STATUS_UPDATE';
            description = `Changed status from "${previousData?.status || 'Unknown'}" to "${updates.status}"`;
          } else if (updates.remark !== undefined) {
            changeType = 'REMARK_UPDATE';
            description = `Updated remark`;
          } else if (updates.outcome_link !== undefined) {
            changeType = 'OUTCOME_UPDATE';
            description = `Updated outcome link`;
          }
        }

        await createAuditLog(
          id,
          userId,
          changeType,
          previousData ? { status: previousData.status, remark: previousData.remark, outcome_link: previousData.outcome_link } : null,
          updates,
          description
        );
      }

      return data;
    } catch (err) {
      console.error('Update failed:', err);
      throw err;
    }
  };

  // Soft delete plan with audit logging
  const deletePlan = async (id) => {
    const planToDelete = plans.find((p) => p.id === id);
    
    // Optimistic update - remove from active list
    setPlans((prev) => prev.filter((p) => p.id !== id));

    try {
      const { id: userId, name: userName } = await getCurrentUser();
      const deletedAt = new Date().toISOString();
      
      // Soft delete: set deleted_at timestamp and deleted_by name
      const { error } = await supabase
        .from('action_plans')
        .update({ 
          deleted_at: deletedAt,
          deleted_by: userName 
        })
        .eq('id', id);

      if (error) {
        // Rollback optimistic update
        if (planToDelete) {
          setPlans((prev) => [...prev, planToDelete]);
        }
        throw error;
      }

      // Audit log
      if (userId && planToDelete) {
        await createAuditLog(
          id,
          userId,
          'SOFT_DELETE',
          planToDelete,
          { deleted_at: deletedAt, deleted_by: userName },
          `Soft deleted action plan: "${planToDelete.action_plan?.substring(0, 50)}..." by ${userName}`
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

      // Audit log
      if (userId) {
        await createAuditLog(
          id,
          userId,
          'RESTORE',
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

    // Audit log before permanent delete
    if (userId && planToDelete) {
      await createAuditLog(
        id,
        userId,
        'PERMANENT_DELETE',
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
  const updateStatus = async (id, status) => {
    // Get previous data for audit log
    const previousPlan = plans.find((p) => p.id === id);
    const previousStatus = previousPlan?.status;
    
    // Optimistic update
    setPlans((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status } : p))
    );

    try {
      const { error } = await supabase
        .from('action_plans')
        .update({ status })
        .eq('id', id);

      if (error) {
        await fetchPlans();
        throw error;
      }

      // Audit log
      const userId = await getCurrentUserId();
      if (userId) {
        await createAuditLog(
          id,
          userId,
          'STATUS_UPDATE',
          { status: previousStatus },
          { status },
          `Changed status from "${previousStatus}" to "${status}"`
        );
      }
    } catch (err) {
      console.error('Status update failed:', err);
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
