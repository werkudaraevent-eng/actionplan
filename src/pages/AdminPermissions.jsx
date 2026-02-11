import { useState, useEffect, useMemo } from 'react';
import { Shield, Loader2, Save, RotateCcw, Check, X, AlertCircle, Info, Lock } from 'lucide-react';
import { supabase, withTimeout } from '../lib/supabase';
import { useToast } from '../components/common/Toast';
import { clearPermissionCache } from '../hooks/usePermission';

/**
 * Permission Rules Configuration
 * Defines hard constraints for each role's permissions
 * 
 * States:
 * - LOCKED_ON: Permission is mandatory and cannot be disabled
 * - LOCKED_OFF: Permission is prohibited and cannot be enabled
 * - CONFIGURABLE: Admin can toggle this permission on/off
 * 
 * Default for undefined permissions is CONFIGURABLE
 */
const PERMISSION_RULES = {
  // 1. ADMIN: System Owner & Validator
  admin: {
    action_plan: {
      // Maintenance Powers (Must be ON to fix data):
      create: 'LOCKED_ON',
      edit: 'LOCKED_ON',
      delete: 'LOCKED_ON',
      update_status: 'LOCKED_ON',
      update_progress: 'LOCKED_ON',
      grade: 'LOCKED_ON',         // Admin's main job is Grading
      // LOGIC FIX: Admin does not "Submit" for review. They ARE the reviewers.
      submit: 'LOCKED_OFF'
    },
    user: {
      create: 'LOCKED_ON',
      edit: 'LOCKED_ON',
      delete: 'LOCKED_ON',
      view: 'LOCKED_ON',
    },
    report: {
      // View removed - dashboard access is default for all users
      export: 'LOCKED_ON',        // Admin must be able to export
    },
    settings: {
      manage: 'LOCKED_ON',
    }
  },
  // 2. EXECUTIVE: High-Level Observer (Read Only)
  executive: {
    action_plan: {
      view: 'LOCKED_ON',          // Mandatory
      // STRICT READ-ONLY POLICY:
      create: 'LOCKED_OFF',
      edit: 'LOCKED_OFF',
      delete: 'LOCKED_OFF',
      update_status: 'LOCKED_OFF',
      update_progress: 'LOCKED_OFF',
      grade: 'LOCKED_OFF',
      submit: 'LOCKED_OFF'
    },
    user: {
      // Executive can view team if enabled, but cannot modify
      create: 'LOCKED_OFF',
      edit: 'LOCKED_OFF',
      delete: 'LOCKED_OFF',
      view: 'CONFIGURABLE',       // Admin can enable team visibility
    },
    report: {
      // View removed - dashboard access is default for all users
      export: 'CONFIGURABLE',     // Admin decides if Executive can export
    },
    settings: {
      manage: 'LOCKED_OFF',
    }
  },
  // 3. LEADER: Department Head (Operational Control)
  leader: {
    action_plan: {
      // Policy Decisions (Admin can Toggle these):
      create: 'CONFIGURABLE',
      edit: 'CONFIGURABLE',
      delete: 'CONFIGURABLE',
      // Mandatory Daily Work:
      update_status: 'LOCKED_ON',
      update_progress: 'LOCKED_ON',
      submit: 'LOCKED_ON',        // Leaders MUST submit to Admin
      grade: 'LOCKED_OFF'         // Leaders cannot grade themselves
    },
    user: {
      // STRICT PRIVACY: Leaders have NO access to User Management
      create: 'LOCKED_OFF',
      edit: 'LOCKED_OFF',
      delete: 'LOCKED_OFF',
      view: 'LOCKED_OFF',
    },
    report: {
      // View removed - dashboard access is default for all users
      export: 'CONFIGURABLE',     // Admin decides if Leader can export
    },
    settings: {
      manage: 'LOCKED_OFF',
    }
  },
  // 4. STAFF: Frontline Executor
  staff: {
    action_plan: {
      // Execution Only:
      update_status: 'LOCKED_ON',   // Staff updates status freely
      update_progress: 'LOCKED_ON', // Staff updates timeline freely
      // Prohibited:
      create: 'LOCKED_OFF',
      edit: 'LOCKED_OFF',
      delete: 'LOCKED_OFF',
      grade: 'LOCKED_OFF',
      submit: 'LOCKED_OFF'          // Staff reports to Leader, not System Submit
    },
    user: {
      // STRICT PRIVACY: Staff have NO access to User Management
      create: 'LOCKED_OFF',
      edit: 'LOCKED_OFF',
      delete: 'LOCKED_OFF',
      view: 'LOCKED_OFF',
    },
    report: {
      // View removed - dashboard access is default for all users
      export: 'LOCKED_OFF',       // Security: Staff cannot export company data
    },
    settings: {
      manage: 'LOCKED_OFF',
    }
  }
};

/**
 * Get the permission rule for a specific role/resource/action
 * @returns 'LOCKED_ON' | 'LOCKED_OFF' | 'CONFIGURABLE'
 */
const getPermissionRule = (role, resource, action) => {
  const roleRules = PERMISSION_RULES[role];
  if (!roleRules) return 'CONFIGURABLE';
  
  // Check for wildcard (admin has '*': 'LOCKED_ON')
  if (roleRules['*']) return roleRules['*'];
  
  // Check specific resource/action
  const resourceRules = roleRules[resource];
  if (!resourceRules) return 'CONFIGURABLE';
  
  return resourceRules[action] || 'CONFIGURABLE';
};

/**
 * Permission Matrix Configuration
 * Defines the structure of the permission grid
 */
const PERMISSION_MATRIX = {
  'Action Plans': {
    resource: 'action_plan',
    actions: [
      { key: 'create', label: 'Create', description: 'Create new action plans' },
      { key: 'edit', label: 'Edit', description: 'Edit action plan details' },
      { key: 'delete', label: 'Delete', description: 'Delete action plans' },
      { key: 'update_status', label: 'Update Status', description: 'Change status (Open → Achieved)' },
      { key: 'update_progress', label: 'Update Progress', description: 'Post progress updates' },
      { key: 'grade', label: 'Grade', description: 'Grade/score action plans' },
      { key: 'submit', label: 'Submit', description: 'Submit for review' },
    ]
  },
  'User Management': {
    resource: 'user',
    actions: [
      { key: 'create', label: 'Create', description: 'Create new users' },
      { key: 'edit', label: 'Edit', description: 'Edit user profiles' },
      { key: 'delete', label: 'Delete', description: 'Delete users' },
      { key: 'view', label: 'View', description: 'View user list' },
    ]
  },
  'Reports': {
    resource: 'report',
    actions: [
      // View removed - dashboard access is default for all users
      { key: 'export', label: 'Export', description: 'Export data to CSV/Excel' },
    ]
  },
  'Settings': {
    resource: 'settings',
    actions: [
      { key: 'manage', label: 'Manage', description: 'Access admin settings' },
    ]
  }
};

const ROLES = [
  { key: 'admin', label: 'Admin', color: 'bg-red-100 text-red-800', description: 'Full system access' },
  { key: 'executive', label: 'Executive', color: 'bg-purple-100 text-purple-800', description: 'Company-wide read access' },
  { key: 'leader', label: 'Leader', color: 'bg-blue-100 text-blue-800', description: 'Department management' },
  { key: 'staff', label: 'Staff', color: 'bg-gray-100 text-gray-800', description: 'Basic access' },
];

export default function AdminPermissions() {
  const { toast } = useToast();
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingChanges, setPendingChanges] = useState(new Map());
  const [error, setError] = useState(null);

  // Fetch permissions on mount
  useEffect(() => {
    fetchPermissions();
  }, []);

  const fetchPermissions = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await withTimeout(
        supabase
          .from('role_permissions')
          .select('*')
          .order('role')
          .order('resource')
          .order('action'),
        8000
      );

      if (fetchError) throw fetchError;
      setPermissions(data || []);
      setPendingChanges(new Map());
    } catch (err) {
      console.error('Error fetching permissions:', err);
      setError('Failed to load permissions');
      toast({ title: 'Error', description: 'Failed to load permissions', variant: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // Build permission lookup map
  const permissionMap = useMemo(() => {
    const map = new Map();
    permissions.forEach(p => {
      const key = `${p.role}:${p.resource}:${p.action}`;
      map.set(key, p);
    });
    return map;
  }, [permissions]);

  // Get current value (considering pending changes)
  const getValue = (role, resource, action) => {
    const key = `${role}:${resource}:${action}`;
    if (pendingChanges.has(key)) {
      return pendingChanges.get(key);
    }
    const perm = permissionMap.get(key);
    
    // For locked permissions, return the locked value
    const rule = getPermissionRule(role, resource, action);
    if (rule === 'LOCKED_ON') return true;
    if (rule === 'LOCKED_OFF') return false;
    
    return perm?.is_allowed ?? false;
  };

  // Handle toggle
  const handleToggle = (role, resource, action) => {
    const rule = getPermissionRule(role, resource, action);
    
    // Check if permission is locked
    if (rule === 'LOCKED_ON') {
      toast({ title: 'Locked', description: 'This permission is mandatory for this role', variant: 'warning' });
      return;
    }
    if (rule === 'LOCKED_OFF') {
      toast({ title: 'Prohibited', description: 'This permission is not available for this role', variant: 'warning' });
      return;
    }

    const key = `${role}:${resource}:${action}`;
    const currentValue = getValue(role, resource, action);
    const newValue = !currentValue;

    setPendingChanges(prev => {
      const next = new Map(prev);
      // Check if this reverts to original value
      const original = permissionMap.get(key)?.is_allowed ?? false;
      if (newValue === original) {
        next.delete(key);
      } else {
        next.set(key, newValue);
      }
      return next;
    });
  };

  // Save all pending changes
  const handleSave = async () => {
    if (pendingChanges.size === 0) return;

    setSaving(true);
    try {
      // Build upsert payload - IMPORTANT: roles are already lowercase from ROLES constant
      const updates = [];
      pendingChanges.forEach((is_allowed, key) => {
        const [role, resource, action] = key.split(':');
        // Ensure role is lowercase for consistency
        updates.push({ 
          role: role.toLowerCase(), 
          resource, 
          action, 
          is_allowed 
        });
      });

      console.log('[AdminPermissions] Saving permissions:', updates);

      // Upsert all changes
      const { error: upsertError } = await supabase
        .from('role_permissions')
        .upsert(updates, { onConflict: 'role,resource,action' });

      if (upsertError) throw upsertError;

      // Clear cache so other components get fresh data
      clearPermissionCache();

      // Refresh local state
      await fetchPermissions();

      toast({ 
        title: 'Saved', 
        description: `${updates.length} permission(s) updated. Users may need to refresh their browser.`, 
        variant: 'success' 
      });
    } catch (err) {
      console.error('Error saving permissions:', err);
      toast({ title: 'Error', description: 'Failed to save permissions', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Reset pending changes
  const handleReset = () => {
    setPendingChanges(new Map());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-teal-500 animate-spin" />
        <span className="ml-3 text-gray-500">Loading permissions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
        <p className="text-red-700 font-medium">{error}</p>
        <button
          onClick={fetchPermissions}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">Access Control</h2>
            <p className="text-sm text-gray-500">Configure role-based permissions</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {pendingChanges.size > 0 && (
            <span className="text-sm text-amber-600 font-medium">
              {pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={handleReset}
            disabled={pendingChanges.size === 0 || saving}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={pendingChanges.size === 0 || saving}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-medium">Permission States:</p>
          <ul className="mt-1 list-disc list-inside text-blue-600 space-y-0.5">
            <li><span className="font-medium">Configurable (toggle)</span> — Admin can enable or disable</li>
            <li><span className="font-medium">Mandatory (green lock)</span> — Always enabled, cannot be changed</li>
            <li><span className="font-medium">Prohibited (red lock)</span> — Always disabled, cannot be changed</li>
            <li>Changes take effect after saving; users may need to refresh</li>
          </ul>
        </div>
      </div>

      {/* Permission Matrix */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-64">
                  Permission
                </th>
                {ROLES.map(role => (
                  <th key={role.key} className="px-4 py-4 text-center min-w-[120px]">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${role.color}`}>
                        {role.label}
                      </span>
                      <span className="text-[10px] text-gray-400 font-normal">
                        {role.description}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(PERMISSION_MATRIX).map(([category, config], catIndex) => (
                <>
                  {/* Category Header */}
                  <tr key={`cat-${category}`} className="bg-gray-50/50">
                    <td colSpan={ROLES.length + 1} className="px-6 py-3">
                      <span className="text-sm font-bold text-gray-700">{category}</span>
                    </td>
                  </tr>
                  {/* Permission Rows */}
                  {config.actions.map((action, actionIndex) => {
                    const isLastInCategory = actionIndex === config.actions.length - 1;
                    return (
                      <tr
                        key={`${config.resource}-${action.key}`}
                        className={`hover:bg-gray-50 transition-colors ${
                          isLastInCategory ? 'border-b border-gray-200' : ''
                        }`}
                      >
                        <td className="px-6 py-3">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-800">{action.label}</span>
                            <span className="text-xs text-gray-400">{action.description}</span>
                          </div>
                        </td>
                        {ROLES.map(role => {
                          const isAllowed = getValue(role.key, config.resource, action.key);
                          const key = `${role.key}:${config.resource}:${action.key}`;
                          const hasChange = pendingChanges.has(key);
                          const rule = getPermissionRule(role.key, config.resource, action.key);
                          const isLocked = rule === 'LOCKED_ON' || rule === 'LOCKED_OFF';
                          const isLockedOn = rule === 'LOCKED_ON';
                          const isLockedOff = rule === 'LOCKED_OFF';

                          return (
                            <td key={role.key} className="px-4 py-3 text-center">
                              {isLocked ? (
                                // Locked state - show lock icon with appropriate color
                                <div
                                  className={`inline-flex items-center justify-center w-12 h-7 rounded-full ${
                                    isLockedOn 
                                      ? 'bg-green-100 border-2 border-green-300' 
                                      : 'bg-red-100 border-2 border-red-300'
                                  }`}
                                  title={isLockedOn ? 'Mandatory - Always enabled' : 'Prohibited - Not available'}
                                >
                                  <Lock className={`w-4 h-4 ${isLockedOn ? 'text-green-600' : 'text-red-500'}`} />
                                </div>
                              ) : (
                                // Configurable state - show toggle
                                <button
                                  onClick={() => handleToggle(role.key, config.resource, action.key)}
                                  className={`relative inline-flex items-center justify-center w-12 h-7 rounded-full transition-all ${
                                    isAllowed
                                      ? 'bg-green-500 hover:bg-green-600'
                                      : 'bg-gray-300 hover:bg-gray-400'
                                  } ${hasChange ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
                                  title={isAllowed ? 'Enabled (click to disable)' : 'Disabled (click to enable)'}
                                >
                                  <span
                                    className={`absolute w-5 h-5 bg-white rounded-full shadow transition-transform ${
                                      isAllowed ? 'translate-x-2.5' : '-translate-x-2.5'
                                    }`}
                                  >
                                    {isAllowed ? (
                                      <Check className="w-3 h-3 text-green-600 absolute top-1 left-1" />
                                    ) : (
                                      <X className="w-3 h-3 text-gray-400 absolute top-1 left-1" />
                                    )}
                                  </span>
                                </button>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <div className="w-8 h-5 bg-green-500 rounded-full"></div>
          <span>Enabled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-5 bg-gray-300 rounded-full"></div>
          <span>Disabled</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-5 bg-green-100 border-2 border-green-300 rounded-full flex items-center justify-center">
            <Lock className="w-3 h-3 text-green-600" />
          </div>
          <span>Mandatory (locked on)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-5 bg-red-100 border-2 border-red-300 rounded-full flex items-center justify-center">
            <Lock className="w-3 h-3 text-red-500" />
          </div>
          <span>Prohibited (locked off)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-5 bg-green-500 rounded-full ring-2 ring-amber-400 ring-offset-1"></div>
          <span>Pending change</span>
        </div>
      </div>
      </div>
    </div>
  );
}
