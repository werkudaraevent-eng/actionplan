import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { supabase, withTimeout } from '../lib/supabase';
import { trackEvent } from '../utils/usageTracking';

const AuthContext = createContext({});

// sync_effective_scope_projection() rewrites profiles.department_code from
// organization_scope_assignments on every profile load, which is how a scope
// restructure reaches a profile on its effective date.
//
// It was switched off on 2026-09-03 after it was found reverting real administration:
// the assignment table is written only by the 2026-07-22 backfill and by restructures,
// never by Team Management, so twelve of sixty-nine profiles held a department the
// projection would overwrite on their next page load. Re-enabled once those rows were
// reconciled (scripts/repair-scope-assignments.cjs) and department_access rows were
// stopped from outranking a real posting (migration 20260903150000).
//
// The underlying gap remains: Team Management still writes profiles without writing
// assignments, so a future department move made through the UI will drift the same way.
// Switch this off again if that reappears before the write path is fixed.
const SYNC_SCOPE_PROJECTION_ON_LOAD = true;

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);
  const profileFetchedRef = useRef(false); // Track if profile was already fetched for current user

  const fetchProfile = useCallback(async (userId, force = false, trackLogin = false) => {
    // Skip if already fetched for this user (unless forced)
    if (profileFetchedRef.current && !force) {
      console.log('Profile already fetched, skipping...');
      return;
    }

    profileFetchedRef.current = true;
    console.log('Fetching profile for:', userId);
    setProfileError(null);

    try {
      const result = await withTimeout(
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single(),
        12000
      );

      console.log('Profile fetch result:', result);

      const { data, error } = result;

      if (error) {
        console.error('Profile fetch error:', error);
        if (error.code === 'PGRST116') {
          setProfileError('PROFILE_NOT_FOUND');
        } else {
          setProfileError(error.message);
        }
        setProfile(null);
      } else if (!data) {
        setProfileError('PROFILE_NOT_FOUND');
        setProfile(null);
      } else {
        setProfile(data);
        setProfileError(null);
        if (SYNC_SCOPE_PROJECTION_ON_LOAD) {
          const { error: projectionError } = await supabase.rpc('sync_effective_scope_projection');
          if (projectionError) console.error('Scope projection sync error:', projectionError);
        }
        if (trackLogin) {
          trackEvent({
            eventType: 'login',
            userId,
            companyId: data.company_id,
            departmentCode: data.department_code,
          });
        }
      }
    } catch (err) {
      console.error('Profile fetch exception:', err);
      setProfileError(err.message || 'Request timeout');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setProfileError('Supabase not configured. Check your .env file.');
      setLoading(false);
      return;
    }

    let mounted = true;

    // Get initial session first
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!mounted) return;

      if (error) {
        console.error('Session error:', error);
        setLoading(false);
        return;
      }

      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('Auth event:', event);

        if (!mounted) return;

        if (event === 'SIGNED_OUT') {
          setUser(null);
          setProfile(null);
          setProfileError(null);
          setLoading(false);
          profileFetchedRef.current = false;
          return;
        }

        if (event === 'SIGNED_IN' && session?.user) {
          // Reset flag for new sign in
          profileFetchedRef.current = false;
          setUser(session.user);
          fetchProfile(session.user.id, false, true);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signIn = async (email, password) => {
    setLoading(true);
    setProfileError(null);
    profileFetchedRef.current = false;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setLoading(false);
        return { data, error };
      }
      // Profile will be fetched by onAuthStateChange
      return { data, error };
    } catch (err) {
      setLoading(false);
      return { data: null, error: err };
    }
  };

  const signOut = async () => {
    try {
      // Use scope: 'local' to avoid 403 errors with some Supabase configurations
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      // Always clear local state regardless of API response
      setUser(null);
      setProfile(null);
      setProfileError(null);
      profileFetchedRef.current = false;
      return { error };
    } catch (err) {
      // Still clear local state on error
      setUser(null);
      setProfile(null);
      setProfileError(null);
      profileFetchedRef.current = false;
      return { error: err };
    }
  };

  const value = {
    user,
    profile,
    loading,
    profileError,
    isHoldingAdmin: profile?.role === 'holding_admin',
    isAdmin: profile?.role === 'admin' || profile?.role === 'holding_admin',
    isExecutive: profile?.role === 'executive',
    isLeader: profile?.role === 'leader' || profile?.role === 'dept_head', // Support both during migration
    isStaff: profile?.role === 'staff',
    departmentCode: profile?.department_code,
    signIn,
    signOut,
    refreshProfile: () => user && fetchProfile(user.id, true),
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
