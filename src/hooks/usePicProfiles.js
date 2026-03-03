import { useState, useEffect, useCallback } from 'react';
import { batchResolveProfiles, collectAllPicUuids, fetchScoringPolicies } from '../utils/picUtils';

/**
 * Hook to batch-resolve PIC UUIDs from a list of plans into display names.
 * Returns a profileMap that can be passed to getPicDisplayName().
 * 
 * Re-resolves whenever plans change (new UUIDs appear).
 */
export function usePicProfiles(plans) {
    const [profileMap, setProfileMap] = useState(new Map());
    const [loading, setLoading] = useState(false);

    // Compute a stable string key from all PIC UUIDs across plans.
    // This breaks the reference-equality trap: even if `plans` is a new array
    // on every render, the stringified UUID set only changes when actual data changes.
    const allUuids = plans && plans.length > 0 ? collectAllPicUuids(plans) : [];
    const uuidsKey = allUuids.length > 0 ? [...allUuids].sort().join(',') : '';

    useEffect(() => {
        if (!uuidsKey) {
            setProfileMap(prev => prev.size === 0 ? prev : new Map());
            return;
        }

        const uuidArray = uuidsKey.split(',');
        let cancelled = false;
        setLoading(true);

        batchResolveProfiles(uuidArray).then(map => {
            if (!cancelled) {
                setProfileMap(map);
                setLoading(false);
            }
        });

        return () => { cancelled = true; };
    }, [uuidsKey]); // Depend on primitive string, NOT the array reference

    return { profileMap, loading };
}

/**
 * Hook to fetch scoring policies (e.g., allow_multiple_pics) for a company.
 */
export function useScoringPolicies(companyId) {
    const [policies, setPolicies] = useState({ allow_multiple_pics: true });
    const [loading, setLoading] = useState(true);

    const refetch = useCallback(async () => {
        setLoading(true);
        const result = await fetchScoringPolicies(companyId);
        setPolicies(result);
        setLoading(false);
    }, [companyId]);

    useEffect(() => {
        if (companyId) {
            refetch();
        } else {
            setPolicies({ allow_multiple_pics: true });
            setLoading(false);
        }
    }, [companyId, refetch]);

    return { policies, loading, refetch };
}
