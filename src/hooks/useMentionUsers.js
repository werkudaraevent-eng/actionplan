import { useState, useEffect } from 'react';
import { supabase, withTimeout } from '../lib/supabase';

/**
 * useMentionUsers - Fetches all active users for @mention suggestions
 * Returns array in react-mentions format: { id, display }
 */
export function useMentionUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const { data, error } = await withTimeout(
          supabase
            .from('profiles')
            .select('id, full_name, department_code, role')
            .order('full_name', { ascending: true }),
          6000
        );

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
  }, []);

  return { users, loading };
}
