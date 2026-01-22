import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Custom hook to fetch all users who have access to a specific department
 * Includes both primary department users and users with additional access
 * 
 * @param {string} departmentCode - The department code to filter by
 * @returns {Object} { users, loading, error, refetch }
 */
export function useDepartmentUsers(departmentCode) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchUsers = async () => {
    if (!departmentCode) {
      setUsers([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Query users where:
      // 1. department_code matches (Primary)
      // 2. OR additional_departments array contains the department (Secondary/Access Rights)
      const { data, error: queryError } = await supabase
        .from('profiles')
        .select('id, full_name, role, department_code, additional_departments')
        .or(`department_code.eq.${departmentCode},additional_departments.cs.{${departmentCode}}`)
        .order('full_name');

      if (queryError) throw queryError;

      // Enhance each user with a flag indicating if they're primary or secondary
      const enhancedUsers = (data || []).map(user => ({
        ...user,
        isPrimary: user.department_code === departmentCode,
        isSecondary: user.additional_departments?.includes(departmentCode) && user.department_code !== departmentCode,
      }));

      setUsers(enhancedUsers);
    } catch (err) {
      console.error('Failed to fetch department users:', err);
      setError(err.message || 'Failed to fetch users');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [departmentCode]);

  return {
    users,
    loading,
    error,
    refetch: fetchUsers,
  };
}
