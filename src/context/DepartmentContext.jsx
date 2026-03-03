import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useAuth } from './AuthContext';
import { useCompanyContext } from './CompanyContext';
import { useDepartments } from '../hooks/useDepartments';

const DepartmentContext = createContext(null);

export function DepartmentProvider({ children }) {
  const { profile, isAdmin } = useAuth();

  // MULTI-TENANT: Get activeCompanyId from CompanyContext
  // CompanyProvider wraps DepartmentProvider in the tree, so this is safe
  const { activeCompanyId } = useCompanyContext();

  const { departments } = useDepartments(activeCompanyId);

  // Calculate accessible departments for the current user
  const accessibleDepts = useMemo(() => {
    if (isAdmin) {
      // Admin can access all departments
      return departments;
    }

    if (!profile) return [];

    // For non-admin users, combine primary + additional departments
    const primary = profile.department_code;
    const additional = profile.additional_departments || [];

    const deptCodes = [primary, ...additional].filter(Boolean);
    return departments.filter(d => deptCodes.includes(d.code));
  }, [isAdmin, profile, departments]);

  // Initialize currentDept with user's primary department
  const [currentDept, setCurrentDept] = useState(() => {
    // Try to get from localStorage first
    const saved = localStorage.getItem('selectedDepartment');
    return saved || profile?.department_code || '';
  });

  // Update currentDept when profile loads or changes
  useEffect(() => {
    if (profile?.department_code && !currentDept) {
      setCurrentDept(profile.department_code);
    }
  }, [profile, currentDept]);

  // Validate that currentDept is still accessible (in case user's access changed)
  useEffect(() => {
    if (currentDept && accessibleDepts.length > 0) {
      const isAccessible = accessibleDepts.some(d => d.code === currentDept);
      if (!isAccessible && accessibleDepts.length > 0) {
        // Current dept is no longer accessible, switch to first accessible dept
        setCurrentDept(accessibleDepts[0].code);
      }
    }
  }, [currentDept, accessibleDepts]);

  // MULTI-TENANT: Reset department when company changes
  useEffect(() => {
    if (activeCompanyId && accessibleDepts.length > 0) {
      // When switching companies, reset to first available department
      const currentStillValid = accessibleDepts.some(d => d.code === currentDept);
      if (!currentStillValid) {
        setCurrentDept(accessibleDepts[0].code);
        localStorage.setItem('selectedDepartment', accessibleDepts[0].code);
      }
    }
  }, [activeCompanyId, accessibleDepts]);

  // Function to switch department
  const switchDept = (deptCode) => {
    setCurrentDept(deptCode);
    // Persist to localStorage
    localStorage.setItem('selectedDepartment', deptCode);
  };

  // Get current department object
  const currentDeptObj = useMemo(() => {
    return departments.find(d => d.code === currentDept) || null;
  }, [departments, currentDept]);

  const value = {
    currentDept,
    currentDeptObj,
    accessibleDepts,
    switchDept,
    hasMultipleDepts: accessibleDepts.length > 1,
  };

  return (
    <DepartmentContext.Provider value={value}>
      {children}
    </DepartmentContext.Provider>
  );
}

export function useDepartmentContext() {
  const context = useContext(DepartmentContext);
  if (!context) {
    throw new Error('useDepartmentContext must be used within DepartmentProvider');
  }
  return context;
}
