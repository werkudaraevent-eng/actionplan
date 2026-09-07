import { describe, expect, it } from 'vitest';
import {
  monthToNumber,
  buildDepartmentNameIndex,
  resolveDepartmentName,
  resolveCurrentDepartmentName,
  hasBeenRenamed,
} from './departmentNameUtils';

// BAS was seeded with its original name, then renamed effective October 2026.
const HISTORY = [
  { department_code: 'BAS', name: 'Business & Administration Services', effective_year: 2000, effective_month: 1 },
  { department_code: 'BAS', name: 'Corporate Services', effective_year: 2026, effective_month: 10 },
  { department_code: 'SM', name: 'Sales & Marketing', effective_year: 2000, effective_month: 1 },
];

const index = buildDepartmentNameIndex(HISTORY);

describe('department name history', () => {
  it('reads the month names action plans actually store', () => {
    expect(monthToNumber('Jan')).toBe(1);
    expect(monthToNumber('Dec')).toBe(12);
    expect(monthToNumber(7)).toBe(7);
    expect(monthToNumber('nonsense')).toBeNull();
  });

  it('keeps the old name on months before the rename took effect', () => {
    expect(resolveDepartmentName(index, 'BAS', 2026, 'Jun')).toBe('Business & Administration Services');
    expect(resolveDepartmentName(index, 'BAS', 2026, 'Sep')).toBe('Business & Administration Services');
  });

  it('switches on the month the rename takes effect, not the month after', () => {
    expect(resolveDepartmentName(index, 'BAS', 2026, 'Oct')).toBe('Corporate Services');
    expect(resolveDepartmentName(index, 'BAS', 2026, 'Nov')).toBe('Corporate Services');
  });

  it('carries the new name into later years without a further entry', () => {
    expect(resolveDepartmentName(index, 'BAS', 2027, 'Feb')).toBe('Corporate Services');
  });

  it('keeps the old name for earlier years', () => {
    expect(resolveDepartmentName(index, 'BAS', 2025, 'Dec')).toBe('Business & Administration Services');
  });

  it('leaves a department that was never renamed alone', () => {
    expect(resolveDepartmentName(index, 'SM', 2026, 'Jun')).toBe('Sales & Marketing');
    expect(resolveDepartmentName(index, 'SM', 2027, 'Jun')).toBe('Sales & Marketing');
  });

  it('falls back to the current name when a department has no history at all', () => {
    // Only reachable for a department created outside the seeded set; today's name beats
    // showing nothing.
    expect(resolveDepartmentName(index, 'NEW', 2026, 'Jun', 'Brand New Unit')).toBe('Brand New Unit');
    expect(resolveDepartmentName(index, 'NEW', 2026, 'Jun')).toBe('NEW');
  });

  it('falls back rather than guessing when the period is unusable', () => {
    expect(resolveDepartmentName(index, 'BAS', null, 'Jun', 'Fallback')).toBe('Fallback');
    expect(resolveDepartmentName(index, 'BAS', 2026, 'Bulan', 'Fallback')).toBe('Fallback');
  });

  it('orders entries newest first regardless of the order they arrive in', () => {
    const shuffled = buildDepartmentNameIndex([HISTORY[1], HISTORY[0]]);
    expect(resolveDepartmentName(shuffled, 'BAS', 2026, 'Jun')).toBe('Business & Administration Services');
    expect(resolveDepartmentName(shuffled, 'BAS', 2026, 'Oct')).toBe('Corporate Services');
  });

  it('resolves today for labels that are about the unit, not a period', () => {
    const future = buildDepartmentNameIndex([
      { department_code: 'X', name: 'Now', effective_year: 2000, effective_month: 1 },
      { department_code: 'X', name: 'Not yet', effective_year: 2099, effective_month: 12 },
    ]);
    expect(resolveCurrentDepartmentName(future, 'X')).toBe('Now');
  });

  it('reports whether a department ever carried another name', () => {
    expect(hasBeenRenamed(index, 'BAS')).toBe(true);
    expect(hasBeenRenamed(index, 'SM')).toBe(false);
    expect(hasBeenRenamed(index, 'NEW')).toBe(false);
  });

  it('ignores malformed rows instead of letting them into the index', () => {
    const dirty = buildDepartmentNameIndex([null, {}, { department_code: 'A' }, { name: 'B' }, ...HISTORY]);
    expect(dirty.has('A')).toBe(false);
    expect(resolveDepartmentName(dirty, 'BAS', 2026, 'Oct')).toBe('Corporate Services');
  });
});
