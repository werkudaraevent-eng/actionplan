import { useState, useEffect } from 'react';
import { supabase, withTimeout } from '../lib/supabase';

/**
 * useMentionUsers - Fetches all active users for @mention suggestions
 * Returns array in react-mentions format: { id, display }
 *
 * @param {string|null} companyId - Optional company_id to scope mentions to a tenant
 */
export function useMentionUsers(companyId = null) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from('profiles')
          .select('id, full_name, department_code, role')
          .order('full_name', { ascending: true });

        // MULTI-TENANT: scope to company when provided
        if (companyId) {
          query = query.eq('company_id', companyId);
        }

        const { data, error } = await withTimeout(query, 6000);

        if (error) throw error;
        if (cancelled) return;

        setUsers(
          (data || [])
            .filter(u => u.full_name)
            .map(u => ({
              id: u.id,
              display: u.full_name,
              department: u.department_code,
              role: u.role,
            }))
        );
      } catch (err) {
        console.error('Failed to fetch mention users:', err);
        if (!cancelled) setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchUsers();
    return () => { cancelled = true; };
  }, [companyId]);

  return { users, loading };
}
