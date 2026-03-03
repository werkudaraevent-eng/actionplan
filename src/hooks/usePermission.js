import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase, withTimeout } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

/**
 * Permission Rules — Single Source of Truth
 * Defines hard constraints for each role's permissions.
 * Used by BOTH the Access Control UI (AdminPermissions) AND the can() function.
 *
 * States:
 * - LOCKED_ON:  Always allowed, cannot be disabled by admin
 * - LOCKED_OFF: Always denied, cannot be enabled by admin
 * - CONFIGURABLE: Admin can toggle via Access Control page (stored in DB)
 */
export const PERMISSION_RULES = {
  admin: {
    action_plan: {
      create: 'LOCKED_ON', edit: 'LOCKED_ON', delete: 'LOCKED_ON',
      update_status: 'LOCKED_ON', update_progress: 'LOCKED_ON',
      grade: 'LOCKED_ON', submit: 'LOCKED_OFF'
    },
    user: { create: 'LOCKED_ON', edit: 'LOCKED_ON', delete: 'LOCKED_ON', view: 'LOCKED_ON' },
    report: { export: 'LOCKED_ON' },
    settings: { manage: 'LOCKED_ON' }
  },
  executive: {
    action_plan: {
      view: 'LOCKED_ON',
      create: 'LOCKED_OFF', edit: 'LOCKED_OFF', delete: 'LOCKED_OFF',
      update_status: 'LOCKED_OFF', update_progress: 'LOCKED_OFF',
      grade: 'LOCKED_OFF', submit: 'LOCKED_OFF'
    },
    user: { create: 'LOCKED_OFF', edit: 'LOCKED_OFF', delete: 'LOCKED_OFF', view: 'CONFIGURABLE' },
    report: { export: 'CONFIGURABLE' },
    settings: { manage: 'LOCKED_OFF' }
  },
  leader: {
    action_plan: {
      create: 'CONFIGURABLE', edit: 'CONFIGURABLE', delete: 'CONFIGURABLE',
      update_status: 'LOCKED_ON', update_progress: 'LOCKED_ON',
      submit: 'LOCKED_ON', grade: 'LOCKED_OFF'
    },
    user: { create: 'LOCKED_OFF', edit: 'LOCKED_OFF', delete: 'LOCKED_OFF', view: 'LOCKED_OFF' },
    report: { export: 'CONFIGURABLE' },
    settings: { manage: 'LOCKED_OFF' }
  },
  staff: {
    action_plan: {
      update_status: 'LOCKED_ON', update_progress: 'LOCKED_ON',
      create: 'LOCKED_OFF', edit: 'LOCKED_OFF', delete: 'LOCKED_OFF',
      grade: 'LOCKED_OFF', submit: 'LOCKED_OFF'
    },
    user: { create: 'LOCKED_OFF', edit: 'LOCKED_OFF', delete: 'LOCKED_OFF', view: 'LOCKED_OFF' },
    report: { export: 'LOCKED_OFF' },
    settings: { manage: 'LOCKED_OFF' }
  }
};

/**
 * Get the permission rule for a specific role/resource/action
 * @returns 'LOCKED_ON' | 'LOCKED_OFF' | 'CONFIGURABLE'
 */
export const getPermissionRule = (role, resource, action) => {
  const normalizedRole = normalizeRole(role);
  const roleRules = PERMISSION_RULES[normalizedRole];
  if (!roleRules) return 'CONFIGURABLE';
  if (roleRules['*']) return roleRules['*'];
  const resourceRules = roleRules[resource];
  if (!resourceRules) return 'CONFIGURABLE';
  return resourceRules[action] || 'CONFIGURABLE';
};

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
      return true;
    }

    // Get user's role (normalize to lowercase)
    const role = normalizeRole(profile?.role);
    if (!role) {
      return false;
    }

    // LOCKED PERMISSIONS: These override the DB completely.
    // LOCKED_ON = always true (e.g., leader:update_status)
    // LOCKED_OFF = always false (e.g., staff:edit)
    // CONFIGURABLE = check the DB
    const rule = getPermissionRule(role, resource, action);
    if (rule === 'LOCKED_ON') return true;
    if (rule === 'LOCKED_OFF') return false;

    // CONFIGURABLE: Check permission map from DB
    const key = `${role}:${resource}:${action}`;
    const allowed = permissionMap.get(key);
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
