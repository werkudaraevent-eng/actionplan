import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

const CompanyContext = createContext(null);

/**
 * CompanyProvider - Global tenant state for multi-tenant Holding Company architecture.
 * 
 * - Fetches the list of companies from `public.companies`
 * - Defaults `activeCompanyId` to the logged-in user's `profile.company_id`
 * - Only `holding_admin` users can switch between companies
 * - Persists the selection in localStorage for session continuity
 * - All data-fetching hooks consume `activeCompanyId` to filter by tenant
 */
export function CompanyProvider({ children }) {
    const { profile, isHoldingAdmin, user } = useAuth();
    const [companies, setCompanies] = useState([]);
    const [activeCompanyId, setActiveCompanyIdRaw] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch companies from DB
    const fetchCompanies = useCallback(async () => {
        if (!supabase || !user) return;
        try {
            const { data, error } = await supabase
                .from('companies')
                .select('id, name')
                .order('name', { ascending: true });

            if (error) {
                console.error('[CompanyContext] Failed to fetch companies:', error);
                setCompanies([]);
            } else {
                console.log(`[CompanyContext] Fetched ${data?.length || 0} companies`);
                setCompanies(data || []);
            }
        } catch (err) {
            console.error('[CompanyContext] Exception fetching companies:', err);
            setCompanies([]);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }
        fetchCompanies();
    }, [user, fetchCompanies]);

    // Initialize activeCompanyId once profile is loaded
    useEffect(() => {
        if (!profile?.company_id) return;

        // For holding_admin: try to restore from localStorage
        if (isHoldingAdmin) {
            const saved = localStorage.getItem('activeCompanyId');
            if (saved) {
                setActiveCompanyIdRaw(saved);
                return;
            }
        }

        // Default to user's own company
        setActiveCompanyIdRaw(profile.company_id);
    }, [profile?.company_id, isHoldingAdmin]);

    // Setter that also persists to localStorage
    const setActiveCompanyId = useCallback((companyId) => {
        console.log('[CompanyContext] Switching active company to:', companyId);
        setActiveCompanyIdRaw(companyId);
        localStorage.setItem('activeCompanyId', companyId);
    }, []);

    // Get active company object
    const activeCompany = useMemo(() => {
        return companies.find(c => c.id === activeCompanyId) || null;
    }, [companies, activeCompanyId]);

    const value = {
        companies,
        activeCompanyId,
        activeCompany,
        setActiveCompanyId,
        loading,
        // Convenience: whether the user can switch tenants
        canSwitchCompany: isHoldingAdmin && companies.length > 1,
        // Allow child components (e.g. HoldingManagement) to force a refresh
        refreshCompanies: fetchCompanies,
    };

    return (
        <CompanyContext.Provider value={value}>
            {children}
        </CompanyContext.Provider>
    );
}

export function useCompanyContext() {
    const context = useContext(CompanyContext);
    if (!context) {
        throw new Error('useCompanyContext must be used within CompanyProvider');
    }
    return context;
}
