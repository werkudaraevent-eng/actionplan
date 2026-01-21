/**
 * Week utility functions for the Activity Chart
 * These are extracted for testability
 */

/**
 * Calculate the start and end dates of the week containing the given date
 * Week starts on Monday and ends on Sunday
 * @param {Date} date - Reference date
 * @returns {{ startOfWeek: Date, endOfWeek: Date }}
 */
export function getWeekRange(date) {
  const start = new Date(date);
  const day = start.getDay();
  const diff = start.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
  start.setDate(diff);
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  return { startOfWeek: start, endOfWeek: end };
}

/**
 * Get ISO week number for a date
 * @param {Date} date - Date to get week number for
 * @returns {number} Week number (1-53)
 */
export function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Format date as "MMM d" (e.g., "Jan 13")
 * @param {Date} date
 * @returns {string}
 */
export function formatShortDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format date as "MMM d, yyyy" (e.g., "Jan 19, 2026")
 * @param {Date} date
 * @returns {string}
 */
export function formatFullDate(date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Get color based on activity count thresholds
 * @param {number} count - Activity count
 * @returns {string} Hex color code
 */
export function getActivityColor(count) {
  if (count >= 10) return '#059669'; // green
  if (count >= 5) return '#3b82f6';  // blue
  if (count > 0) return '#f59e0b';   // amber
  return '#d1d5db';                   // gray
}

/**
 * Filter plans by week range
 * @param {Array} plans - Array of plans with updated_at field
 * @param {Date} startOfWeek - Start of week
 * @param {Date} endOfWeek - End of week
 * @returns {Array} Filtered plans
 */
export function filterPlansByWeek(plans, startOfWeek, endOfWeek) {
  return plans.filter(p => {
    if (!p.updated_at) return false;
    const updateDate = new Date(p.updated_at);
    return updateDate >= startOfWeek && updateDate <= endOfWeek;
  });
}

/**
 * Group plans by department
 * @param {Array} plans - Array of plans
 * @returns {Array} Chart data sorted by value descending
 */
export function groupByDepartment(plans) {
  const deptActivity = {};
  plans.forEach(plan => {
    const dept = plan.department_code || 'Unknown';
    deptActivity[dept] = (deptActivity[dept] || 0) + 1;
  });
  
  return Object.entries(deptActivity)
    .map(([name, value]) => ({
      name,
      value,
      fill: getActivityColor(value)
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Group plans by day of week
 * @param {Array} plans - Array of plans with updated_at field
 * @returns {Array} Chart data with all 7 days in Mon-Sun order
 */
export function groupByDayOfWeek(plans) {
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dayActivity = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  
  plans.forEach(plan => {
    if (!plan.updated_at) return;
    const updateDate = new Date(plan.updated_at);
    const dayIndex = (updateDate.getDay() + 6) % 7; // Convert to Mon=0
    const dayName = dayNames[dayIndex];
    dayActivity[dayName]++;
  });
  
  return dayNames.map(day => ({
    name: day,
    value: dayActivity[day],
    fill: getActivityColor(dayActivity[day])
  }));
}
