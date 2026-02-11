import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, withTimeout } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

/**
 * Permission cache - shared across all hook instances
 * Prevents redundant fetches when multiple components use the hook
 */
let permissionCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Normalize role to lowercase for consistent comparison
 * Handles null/undefined safely
 */
const normalizeRole = (role) => {
  if (!role) return '';
  return String(role).toLowerCase().trim();
};

/**
 * usePermission - Custom hook for role-based permission checks
 * 
 * Fetches permissions from the database and provides a `can` function
 * to check if the current user's role has permission for a specific action.
 * 
 * IMPORTANT: All role comparisons are case-insensitive (normalized to lowercase)
 * 
 * @returns {Object} { can, permissions, loading, error, refresh }
 * 
 * @example
 * const { can, loading } = usePermission();
 * if (can('action_plan', 'edit')) {
 *   // Show edit button
 * }
 */
export function usePermission() {
  const { profile, isAdmin } = useAuth();
  const [permissions, setPermissions] = useState(permissionCache || []);
  const [loading, setLoading] = useState(!permissionCache);
  const [error, setError] = useState(null);

  // Fetch permissions from database
  const fetchPermissions = useCallback(async (force = false) => {
    // Use cache if valid and not forcing refresh
    const now = Date.now();
    if (!force && permissionCache && cacheTimestamp && (now - cacheTimestamp < CACHE_TTL)) {
      setPermissions(permissionCache);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await withTimeout(
        supabase
          .from('role_permissions')
          .select('role, resource, action, is_allowed')
          .order('role')
          .order('resource')
          .order('action'),
        8000
      );

      if (fetchError) throw fetchError;

      // Update cache
      permissionCache = data || [];
      cacheTimestamp = Date.now();
      setPermissions(permissionCache);
      
      // Debug: Log fetched permissions with details
      console.log(`[usePermission] Fetched ${permissionCache.length} permissions from DB`);
      
      // Log a sample of permissions for the 'leader' role
      const leaderPerms = permissionCache.filter(p => p.role?.toLowerCase() === 'leader');
      console.log('[usePermission] Leader permissions:', leaderPerms.map(p => `${p.resource}:${p.action}=${p.is_allowed}`));
    } catch (err) {
      console.error('Error fetching permissions:', err);
      setError('Failed to load permissions');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // Build a lookup map for fast permission checks
  // CRITICAL: Normalize role to lowercase for consistent lookups
  const permissionMap = useMemo(() => {
    const map = new Map();
    permissions.forEach(p => {
      // Normalize role from DB to lowercase for consistent matching
      const normalizedRole = normalizeRole(p.role);
      const key = `${normalizedRole}:${p.resource}:${p.action}`;
      map.set(key, p.is_allowed);
    });
    
    // Debug: Log map size
    if (permissions.length > 0) {
      console.log(`[usePermission] Built permission map with ${map.size} entries`);
    }
    
    return map;
  }, [permissions]);

  /**
   * Check if current user can perform an action on a resource
   * @param {string} resource - The resource (e.g., 'action_plan', 'user', 'report')
   * @param {string} action - The action (e.g., 'create', 'edit', 'delete')
   * @returns {boolean} True if allowed, false otherwise
   */
  const can = useCallback((resource, action) => {
    // Admin always has all permissions (hardcoded fallback)
    if (isAdmin) {
      console.log(`[usePermission] Admin bypass: ${resource}:${action} => ALLOWED`);
      return true;
    }

    // Get user's role (normalize to lowercase)
    const role = normalizeRole(profile?.role);
    if (!role) {
      console.log('[usePermission] No role found for user, denying access');
      return false;
    }

    // Check permission map (role already normalized in map)
    const key = `${role}:${resource}:${action}`;
    const allowed = permissionMap.get(key);

    // Debug logging with full context
    console.log(`[usePermission] Check: userRole="${profile?.role}" (normalized="${role}"), key="${key}" => ${allowed === true ? 'ALLOWED' : 'DENIED'}`);

    // If permission not found in DB, default to false
    return allowed === true;
  }, [profile?.role, isAdmin, permissionMap]);

  /**
   * Check permission for a specific role (useful for admin UI)
   * @param {string} role - The role to check
   * @param {string} resource - The resource
   * @param {string} action - The action
   * @returns {boolean} True if allowed
   */
  const canRole = useCallback((role, resource, action) => {
    // Normalize the role for lookup
    const normalizedRole = normalizeRole(role);
    const key = `${normalizedRole}:${resource}:${action}`;
    return permissionMap.get(key) === true;
  }, [permissionMap]);

  /**
   * Force refresh permissions from database
   * Call this after permissions are updated in AdminPermissions
   */
  const refresh = useCallback(() => {
    console.log('[usePermission] Force refreshing permissions...');
    return fetchPermissions(true);
  }, [fetchPermissions]);

  return {
    can,
    canRole,
    permissions,
    loading,
    error,
    refresh
  };
}

/**
 * Clear the permission cache (call when permissions are updated)
 * This forces all usePermission hooks to refetch on next render
 */
export function clearPermissionCache() {
  console.log('[usePermission] Cache cleared');
  permissionCache = null;
  cacheTimestamp = null;
}

/**
 * Permission constants for type safety
 */
export const RESOURCES = {
  ACTION_PLAN: 'action_plan',
  USER: 'user',
  REPORT: 'report',
  SETTINGS: 'settings'
};

export const ACTIONS = {
  CREATE: 'create',
  EDIT: 'edit',
  DELETE: 'delete',
  UPDATE_STATUS: 'update_status',
  UPDATE_PROGRESS: 'update_progress',
  GRADE: 'grade',
  SUBMIT: 'submit',
  VIEW: 'view',
  EXPORT: 'export',
  MANAGE: 'manage'
};

export default usePermission;
