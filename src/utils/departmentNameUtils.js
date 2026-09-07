const MONTH_INDEX = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

/** Action plans store the month as a three-letter name; the history stores a number. */
export function monthToNumber(month) {
  if (typeof month === 'number') return month;
  return MONTH_INDEX[String(month || '').slice(0, 3)] ?? null;
}

/**
 * Group the flat history into a lookup keyed by department code, each list ordered newest
 * period first so resolving is a scan that stops at the first match.
 *
 * Built once per fetch rather than per row: a table of two thousand plans would otherwise
 * re-sort the same handful of history rows two thousand times.
 */
export function buildDepartmentNameIndex(history = []) {
  const index = new Map();
  for (const entry of history) {
    if (!entry?.department_code || !entry?.name) continue;
    if (!index.has(entry.department_code)) index.set(entry.department_code, []);
    index.get(entry.department_code).push(entry);
  }
  for (const entries of index.values()) {
    entries.sort((a, b) => (b.effective_year - a.effective_year) || (b.effective_month - a.effective_month));
  }
  return index;
}

/**
 * What a department was called during a given period.
 *
 * The answer is the most recent naming that had already taken effect by that month. A
 * period earlier than every recorded naming falls back to `fallbackName`, which callers
 * pass as the department's current name — that only happens for a department whose history
 * was never seeded, and showing today's name beats showing nothing.
 *
 * @param {Map}    index        — from buildDepartmentNameIndex
 * @param {string} code         — department code, which never changes across a rename
 * @param {number} year
 * @param {string|number} month — 'Jun' or 6
 * @param {string} fallbackName — the department's current name
 */
export function resolveDepartmentName(index, code, year, month, fallbackName = '') {
  const entries = index?.get?.(code);
  if (!entries?.length || !year) return fallbackName || code;

  const monthNumber = monthToNumber(month);
  if (monthNumber == null) return fallbackName || code;

  const match = entries.find((entry) => (
    entry.effective_year < year
    || (entry.effective_year === year && entry.effective_month <= monthNumber)
  ));
  return match?.name || fallbackName || code;
}

/**
 * The naming in force today, used wherever the label is about the department itself
 * rather than about a period: the sidebar, pickers, team administration.
 */
export function resolveCurrentDepartmentName(index, code, fallbackName = '') {
  const now = new Date();
  return resolveDepartmentName(index, code, now.getFullYear(), now.getMonth() + 1, fallbackName);
}

/**
 * Whether a department was ever called something else, so the interface can say so
 * instead of leaving a reader to wonder why a report and a filter disagree.
 */
export function hasBeenRenamed(index, code) {
  return (index?.get?.(code)?.length || 0) > 1;
}
