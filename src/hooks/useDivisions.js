import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { buildDivisionSettings, filterCompanyRows } from '../utils/divisionManagementUtils';

/**
 * Divisions for one company, plus the per-tenant hierarchy switch that decides
 * whether divisions should be shown at all.
 *
 * Before this hook, every screen that needed divisions ran its own pair of
 * queries against `divisions` and `system_settings` (ActionPlanModal, ImportModal,
 * CompanyActionPlans, AdminSettings). The dashboards need the same pair, so the
 * fetch lives here once instead of a fifth and sixth copy.
 *
 * `hierarchyEnabled` is false for a company that never turned divisions on. Screens
 * are expected to hide their division affordances entirely in that case, so a tenant
 * without divisions sees exactly what it saw before the feature existed.
 *
 * @param {string|null} companyId — tenant to scope to. Nothing is fetched until it resolves.
 */
export function useDivisions(companyId = null) {
  const [divisions, setDivisions] = useState([]);
  const [settings, setSettings] = useState(buildDivisionSettings(null));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDivisions = useCallback(async () => {
    if (!supabase) {
      setError('Supabase not configured');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [divisionsResult, settingsResult] = await Promise.all([
        supabase
          .from('divisions')
          .select('id, company_id, department_code, code, name, is_active')
          .eq('company_id', companyId) // STRICT: always scope to tenant — never omit
          .eq('is_active', true)
          .order('code', { ascending: true }),
        supabase
          .from('system_settings')
          .select('division_hierarchy_enabled, division_readiness_policy')
          .eq('company_id', companyId)
          .maybeSingle(),
      ]);

      if (divisionsResult.error) throw divisionsResult.error;

      // PostgREST already filtered by company_id, but the rows pass through the same
      // client-side guard the other division screens use, so a future join or view
      // change cannot quietly widen the tenant boundary.
      setDivisions(filterCompanyRows(divisionsResult.data, companyId));
      setSettings(buildDivisionSettings(settingsResult.data));
    } catch (err) {
      setError(err.message);
      setDivisions([]);
      setSettings(buildDivisionSettings(null));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    // HYDRATION GUARD: mirrors useDepartments. Querying while companyId is still null
    // would read every tenant's divisions for one render.
    if (!companyId) {
      setDivisions([]);
      setSettings(buildDivisionSettings(null));
      setLoading(false);
      return;
    }

    // STATE CLEANUP: drop the previous tenant's rows before the new query lands,
    // so switching company never flashes the old company's divisions.
    setDivisions([]);
    fetchDivisions();

    const channel = supabase
      .channel(`divisions_changes_${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'divisions' }, () => {
        fetchDivisions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId, fetchDivisions]);

  return {
    divisions,
    hierarchyEnabled: settings.division_hierarchy_enabled,
    readinessPolicy: settings.division_readiness_policy,
    loading,
    error,
    refetch: fetchDivisions,
  };
}
