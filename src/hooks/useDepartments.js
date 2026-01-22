import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Custom hook to fetch departments from Supabase
 * Returns departments sorted alphabetically by name
 */
export function useDepartments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDepartments = async () => {
      if (!supabase) {
        setError('Supabase not configured');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('departments')
          .select('code, name')
          .order('name', { ascending: true });

        if (fetchError) throw fetchError;
        setDepartments(data || []);
      } catch (err) {
        console.error('Error fetching departments:', err);
        setError(err.message);
        setDepartments([]);
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
  }, []);

  return { departments, loading, error };
}
