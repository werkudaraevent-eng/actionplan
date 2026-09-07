import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { buildDepartmentNameIndex, resolveDepartmentName, resolveCurrentDepartmentName } from '../utils/departmentNameUtils';

/**
 * Custom hook to fetch departments from Supabase
 * Returns departments sorted alphabetically by name
 * 
 * @param {string|null} companyId - Optional company_id to filter departments by tenant
 */
export function useDepartments(companyId = null) {
  const [departments, setDepartments] = useState([]);
  // What each department was called during each period. Kept here because every screen
  // that shows a department name already holds this hook, and the table is small enough
  // that resolving in memory beats a lookup per row.
  const [nameHistory, setNameHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // HYDRATION GUARD: Do NOT fire the query until companyId has resolved.
    // Without this, the initial render (companyId = null) fetches ALL companies'
    // departments, causing a brief cross-tenant data bleed on page refresh.
    if (!companyId) {
      setDepartments([]);
      setLoading(false);
      return;
    }

    const fetchDepartments = async () => {
      if (!supabase) {
        setError('Supabase not configured');
        setLoading(false);
        return;
      }

      try {
        // STATE CLEANUP: Clear previous tenant's data immediately to prevent
        // showing "ghost" departments while the new query is in flight.
        setDepartments([]);
        setLoading(true);
        setError(null);

        // Primary approach: Fetch without is_active filter first (most reliable)
        // This prevents errors if is_active column doesn't exist
        let query = supabase
          .from('departments')
          .select('*')  // Select all to check which columns exist
          .eq('company_id', companyId) // STRICT: Always scope to tenant — never omit
          .order('name', { ascending: true });

        let { data, error: fetchError } = await query;

        // DEBUG: Log raw result
        console.log('useDepartments: Raw fetch result:', data?.length || 0, 'departments', `(company: ${companyId})`);

        if (fetchError) {
          console.error('useDepartments: Error fetching departments:', fetchError);
          throw fetchError;
        }

        // Check if is_active column exists and filter if so
        if (data && data.length > 0 && data[0].hasOwnProperty('is_active')) {
          console.log('useDepartments: is_active column exists, filtering...');
          data = data.filter(d => d.is_active === true || d.is_active === undefined);
          console.log('useDepartments: After is_active filter:', data.length, 'departments');
        }

        // Map to only return required fields
        const cleanData = (data || []).map(d => ({
          code: d.code,
          name: d.name,
          company_id: d.company_id || null,
        }));

        console.log('useDepartments: Final result:', cleanData.length, 'departments');
        setDepartments(cleanData);

        const { data: history, error: historyError } = await supabase
          .from('department_name_history')
          .select('department_code, name, effective_year, effective_month')
          .eq('company_id', companyId);
        // A missing history only costs period-correct labels, so it must not take the
        // department list down with it.
        if (historyError) console.error('useDepartments: name history unavailable:', historyError.message);
        setNameHistory(history || []);
      } catch (err) {
        console.error('useDepartments: Error fetching departments:', err);
        setError(err.message);
        setDepartments([]);
        setNameHistory([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDepartments();

    // Real-time subscription for department changes
    if (!supabase) return;

    const channel = supabase
      .channel('departments_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'departments',
        },
        () => {
          // Refetch departments when changes occur
          fetchDepartments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  const nameIndex = useMemo(() => buildDepartmentNameIndex(nameHistory), [nameHistory]);
  const currentName = useCallback(
    (code) => resolveCurrentDepartmentName(nameIndex, code, departments.find((d) => d.code === code)?.name || code),
    [nameIndex, departments]
  );
  // For anything labelled by the period it belongs to: a plan row, a monthly report line.
  const nameAt = useCallback(
    (code, year, month) => resolveDepartmentName(nameIndex, code, year, month, departments.find((d) => d.code === code)?.name || code),
    [nameIndex, departments]
  );

  return { departments, loading, error, nameIndex, nameAt, currentName };
}

