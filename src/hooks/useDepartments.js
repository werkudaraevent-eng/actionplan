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

        // Primary approach: Fetch without is_active filter first (most reliable)
        // This prevents errors if is_active column doesn't exist
        let { data, error: fetchError } = await supabase
          .from('departments')
          .select('*')  // Select all to check which columns exist
          .order('name', { ascending: true });

        // DEBUG: Log raw result
        console.log('useDepartments: Raw fetch result:', data?.length || 0, 'departments', data);

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
          name: d.name
        }));

        console.log('useDepartments: Final result:', cleanData.length, 'departments');
        setDepartments(cleanData);
      } catch (err) {
        console.error('useDepartments: Error fetching departments:', err);
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
