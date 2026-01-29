/**
 * Lock/Unlock utility functions for Action Plans
 * 
 * Business Rules:
 * - Auto-Lock: Plans lock on a configurable day of the following month
 * - Default: 6th of next month (e.g., January plans lock on February 6th)
 * - Monthly overrides: Admin can set specific deadlines for individual months
 * - Lock feature can be toggled ON/OFF by admin via system_settings
 * - Unlock requires admin approval
 */

// Month name to index mapping (full names)
const MONTH_MAP = {
  'January': 0, 'February': 1, 'March': 2, 'April': 3,
  'May': 4, 'June': 5, 'July': 6, 'August': 7,
  'September': 8, 'October': 9, 'November': 10, 'December': 11
};

// Abbreviated month names mapping
const MONTH_MAP_SHORT = {
  'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3,
  'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7,
  'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
};

// Index to month name mapping
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Default settings (used when system_settings not loaded)
const DEFAULT_LOCK_SETTINGS = {
  isLockEnabled: true,
  lockCutoffDay: 6,
  monthlyOverrides: [] // Array of { month_index, year, lock_date }
};

/**
 * Parse month name to month index (0-11)
 * Supports both full names ("January") and abbreviated ("Jan")
 * @param {string} monthName - Month name (e.g., "January" or "Jan")
 * @returns {number} Month index (0-11) or -1 if invalid
 */
export function parseMonthName(monthName) {
  if (!monthName) return -1;
  const normalized = monthName.trim();
  // Try full name first, then abbreviated
  return MONTH_MAP[normalized] ?? MONTH_MAP_SHORT[normalized] ?? -1;
}

/**
 * Get month name from index
 * @param {number} monthIndex - Month index (0-11)
 * @returns {string} Month name or empty string if invalid
 */
export function getMonthName(monthIndex) {
  if (monthIndex < 0 || monthIndex > 11) return '';
  return MONTH_NAMES[monthIndex];
}

/**
 * Find monthly override for a specific plan month/year
 * @param {number} monthIndex - Plan month index (0-11)
 * @param {number} year - Plan year
 * @param {Array} monthlyOverrides - Array of override objects
 * @returns {Object|null} Override object or null if not found
 */
export function findMonthlyOverride(monthIndex, year, monthlyOverrides = []) {
  if (!monthlyOverrides || !Array.isArray(monthlyOverrides)) return null;
  return monthlyOverrides.find(
    o => o.month_index === monthIndex && o.year === year
  ) || null;
}

/**
 * Calculate the lock deadline for a given plan month/year
 * Checks for monthly override first, then falls back to default cutoff day
 * @param {string} planMonth - Month name (e.g., "January")
 * @param {number} planYear - Year (e.g., 2026)
 * @param {number} cutoffDay - Day of month for cutoff (default: 6)
 * @param {Array} monthlyOverrides - Array of monthly override objects
 * @returns {Date|null} Lock deadline date or null if invalid input
 */
export function getLockDeadline(planMonth, planYear, cutoffDay = DEFAULT_LOCK_SETTINGS.lockCutoffDay, monthlyOverrides = []) {
  const monthIndex = parseMonthName(planMonth);
  if (monthIndex === -1 || !planYear) return null;
  
  // Check for monthly override first
  const override = findMonthlyOverride(monthIndex, planYear, monthlyOverrides);
  if (override && override.lock_date) {
    return new Date(override.lock_date);
  }
  
  // Fall back to default calculation
  // Ensure cutoff day is valid (1-28)
  const day = Math.max(1, Math.min(28, cutoffDay || DEFAULT_LOCK_SETTINGS.lockCutoffDay));
  
  // Create date for the cutoff day of the next month
  // Note: If month is December (11), next month is January of next year
  const nextMonth = monthIndex + 1;
  const year = nextMonth > 11 ? planYear + 1 : planYear;
  const month = nextMonth > 11 ? 0 : nextMonth;
  
  const deadline = new Date(year, month, day, 23, 59, 59, 999);
  return deadline;
}

/**
 * Check if a plan is locked based on date and unlock status
 * @param {string} planMonth - Month name (e.g., "January")
 * @param {number} planYear - Year (e.g., 2026)
 * @param {string|null} unlockStatus - Current unlock status ('pending', 'approved', 'rejected', or null)
 * @param {string|null} approvedUntil - ISO timestamp of approval expiry (optional)
 * @param {Object} settings - Lock settings from system_settings
 * @param {boolean} settings.isLockEnabled - Whether lock feature is enabled
 * @param {number} settings.lockCutoffDay - Day of month for cutoff
 * @param {Array} settings.monthlyOverrides - Array of monthly override objects
 * @returns {boolean} True if plan is locked
 */
export function isPlanLocked(planMonth, planYear, unlockStatus = null, approvedUntil = null, settings = DEFAULT_LOCK_SETTINGS) {
  // If lock feature is disabled globally, nothing is locked
  if (!settings?.isLockEnabled) {
    return false;
  }
  
  // If admin approved and approval hasn't expired, plan is unlocked
  if (unlockStatus === 'approved') {
    if (approvedUntil) {
      const expiryDate = new Date(approvedUntil);
      if (new Date() < expiryDate) {
        return false; // Still within approval window
      }
      // Approval expired, check deadline
    } else {
      return false; // Approved with no expiry
    }
  }
  
  // Calculate deadline using configurable cutoff day and monthly overrides
  const cutoffDay = settings?.lockCutoffDay || DEFAULT_LOCK_SETTINGS.lockCutoffDay;
  const monthlyOverrides = settings?.monthlyOverrides || [];
  const deadline = getLockDeadline(planMonth, planYear, cutoffDay, monthlyOverrides);
  if (!deadline) return false; // Invalid input, don't lock
  
  const now = new Date();
  return now > deadline;
}

/**
 * Get lock status details for display
 * @param {string} planMonth - Month name
 * @param {number} planYear - Year
 * @param {string|null} unlockStatus - Current unlock status
 * @param {string|null} approvedUntil - Approval expiry timestamp
 * @param {Object} settings - Lock settings from system_settings
 * @returns {Object} Lock status details
 */
export function getLockStatus(planMonth, planYear, unlockStatus = null, approvedUntil = null, settings = DEFAULT_LOCK_SETTINGS) {
  const cutoffDay = settings?.lockCutoffDay || DEFAULT_LOCK_SETTINGS.lockCutoffDay;
  const monthlyOverrides = settings?.monthlyOverrides || [];
  const deadline = getLockDeadline(planMonth, planYear, cutoffDay, monthlyOverrides);
  const isLocked = isPlanLocked(planMonth, planYear, unlockStatus, approvedUntil, settings);
  const now = new Date();
  
  // Check if this month has an override
  const monthIndex = parseMonthName(planMonth);
  const hasOverride = findMonthlyOverride(monthIndex, planYear, monthlyOverrides) !== null;
  
  // Calculate days until/since lock
  let daysUntilLock = null;
  if (deadline) {
    const diffMs = deadline.getTime() - now.getTime();
    daysUntilLock = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }
  
  return {
    isLocked,
    isLockEnabled: settings?.isLockEnabled ?? true,
    deadline,
    cutoffDay,
    hasOverride,
    daysUntilLock,
    unlockStatus,
    hasPendingRequest: unlockStatus === 'pending',
    isApproved: unlockStatus === 'approved',
    isRejected: unlockStatus === 'rejected',
    approvedUntil: approvedUntil ? new Date(approvedUntil) : null
  };
}

/**
 * Format lock deadline for display
 * @param {Date} deadline - Lock deadline date
 * @returns {string} Formatted date string
 */
export function formatLockDeadline(deadline) {
  if (!deadline) return '';
  return deadline.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

/**
 * Get human-readable lock status message
 * @param {Object} lockStatus - Result from getLockStatus()
 * @returns {string} Status message
 */
export function getLockStatusMessage(lockStatus) {
  // If lock feature is disabled
  if (!lockStatus.isLockEnabled) {
    return 'Lock feature disabled';
  }
  
  if (!lockStatus.isLocked) {
    if (lockStatus.daysUntilLock !== null && lockStatus.daysUntilLock > 0) {
      const suffix = lockStatus.hasOverride ? ' (custom deadline)' : '';
      return `Editable for ${lockStatus.daysUntilLock} more day${lockStatus.daysUntilLock === 1 ? '' : 's'}${suffix}`;
    }
    if (lockStatus.isApproved) {
      return 'Unlocked by admin';
    }
    return 'Editable';
  }
  
  if (lockStatus.hasPendingRequest) {
    return 'Locked - Unlock request pending';
  }
  
  if (lockStatus.isRejected) {
    return 'Locked - Unlock request rejected';
  }
  
  const suffix = lockStatus.hasOverride ? ' (custom deadline)' : '';
  return `Locked since ${formatLockDeadline(lockStatus.deadline)}${suffix}`;
}

/**
 * Get default lock settings
 * @returns {Object} Default settings
 */
export function getDefaultLockSettings() {
  return { ...DEFAULT_LOCK_SETTINGS };
}

/**
 * Calculate default deadline for a month (without overrides)
 * Useful for showing what the default would be in the UI
 * @param {number} monthIndex - Month index (0-11)
 * @param {number} year - Year
 * @param {number} cutoffDay - Default cutoff day
 * @returns {Date} Default deadline date
 */
export function getDefaultDeadline(monthIndex, year, cutoffDay = 6) {
  const day = Math.max(1, Math.min(28, cutoffDay));
  const nextMonth = monthIndex + 1;
  const deadlineYear = nextMonth > 11 ? year + 1 : year;
  const deadlineMonth = nextMonth > 11 ? 0 : nextMonth;
  return new Date(deadlineYear, deadlineMonth, day, 23, 59, 59, 999);
}


/**
 * Server-side lock check - fetches fresh lock settings from database
 * Use this for pre-flight validation before write operations
 * Prevents stale state issues where user's cached settings are outdated
 * 
 * @param {Object} supabase - Supabase client instance
 * @param {string} planMonth - Month name (e.g., "January" or "Jan")
 * @param {number} planYear - Year (e.g., 2026)
 * @param {string|null} unlockStatus - Current unlock status of the plan
 * @param {string|null} approvedUntil - Approval expiry timestamp
 * @returns {Promise<Object>} Fresh lock status from server
 */
export async function checkLockStatusServerSide(supabase, planMonth, planYear, unlockStatus = null, approvedUntil = null) {
  try {
    // Fetch fresh settings from database
    const [settingsResult, schedulesResult] = await Promise.all([
      supabase
        .from('system_settings')
        .select('is_lock_enabled, lock_cutoff_day')
        .eq('id', 1)
        .single(),
      supabase
        .from('monthly_lock_schedules')
        .select('month_index, year, lock_date')
    ]);

    const settings = {
      isLockEnabled: settingsResult.data?.is_lock_enabled ?? false,
      lockCutoffDay: settingsResult.data?.lock_cutoff_day ?? 6,
      monthlyOverrides: schedulesResult.data || []
    };

    // Calculate lock status with fresh settings
    const isLocked = isPlanLocked(planMonth, planYear, unlockStatus, approvedUntil, settings);
    const deadline = getLockDeadline(planMonth, planYear, settings.lockCutoffDay, settings.monthlyOverrides);

    return {
      isLocked,
      isLockEnabled: settings.isLockEnabled,
      deadline,
      settings
    };
  } catch (err) {
    console.error('Error checking lock status server-side:', err);
    // On error, return safe default (not locked) to avoid blocking legitimate edits
    return {
      isLocked: false,
      isLockEnabled: false,
      deadline: null,
      settings: DEFAULT_LOCK_SETTINGS,
      error: err.message
    };
  }
}
