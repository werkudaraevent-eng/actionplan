import { describe, expect, it } from 'vitest';
import {
  buildDivisionSettings,
  filterCompanyRows,
  getDivisionMemberCount,
  getDivisionOptions,
  filterPlansByDivision,
  validateDivisionImportValue,
  buildDivisionFingerprint,
  addDivisionToRecurringPlans,
  resolveDivisionCode,
} from './divisionManagementUtils';

describe('division management helpers', () => {
  it('uses safe feature-off and advisory defaults when settings row is missing', () => {
    expect(buildDivisionSettings(null)).toEqual({
      division_hierarchy_enabled: false,
      division_readiness_policy: 'ADVISORY',
    });
  });

  it('normalizes settings values from database row', () => {
    expect(buildDivisionSettings({
      division_hierarchy_enabled: true,
      division_readiness_policy: 'REQUIRED',
    })).toEqual({
      division_hierarchy_enabled: true,
      division_readiness_policy: 'REQUIRED',
    });
  });

  it('keeps only rows belonging to active company', () => {
    expect(filterCompanyRows([
      { id: 'one', company_id: 'company-a' },
      { id: 'two', company_id: 'company-b' },
    ], 'company-a')).toEqual([{ id: 'one', company_id: 'company-a' }]);
  });

  it('counts memberships for selected division', () => {
    expect(getDivisionMemberCount([
      { division_id: 'division-a' },
      { division_id: 'division-a' },
      { division_id: 'division-b' },
    ], 'division-a')).toBe(2);
  });

  it('filters active divisions by department and keeps department-level option', () => {
    expect(getDivisionOptions([
      { id: 'one', code: 'SALES_A', department_code: 'SALES', is_active: true },
      { id: 'two', code: 'HR_A', department_code: 'HR', is_active: true },
      { id: 'three', code: 'SALES_OLD', department_code: 'SALES', is_active: false },
    ], 'SALES')).toEqual([
      { value: '', label: 'Department level' },
      { value: 'one', label: 'SALES_A' },
    ]);
  });

  it('filters plans by selected division including department-level plans', () => {
    expect(filterPlansByDivision([
      { id: 'one', division_id: 'division-a' },
      { id: 'two', division_id: null },
      { id: 'three', division_id: 'division-b' },
    ], 'division-a')).toEqual([
      { id: 'one', division_id: 'division-a' },
      { id: 'two', division_id: null },
    ]);
  });

  it('validates optional division import against department and active state', () => {
    expect(validateDivisionImportValue('', 'SALES', [
      { code: 'SALES_A', department_code: 'SALES', is_active: true },
    ])).toEqual(null);
    expect(validateDivisionImportValue('HR_A', 'SALES', [
      { code: 'HR_A', department_code: 'HR', is_active: true },
    ])).toBe('Division HR_A belongs to HR, not SALES.');
  });

  it('keeps division scope separate in consolidation fingerprints', () => {
    const base = { department_code: 'SALES', goal_strategy: 'Grow', action_plan: 'Sell', pic_ids: [] };
    expect(buildDivisionFingerprint({ ...base, division_id: 'one' })).not.toBe(
      buildDivisionFingerprint({ ...base, division_id: 'two' })
    );
    expect(buildDivisionFingerprint({ ...base, division_id: null })).not.toBe(
      buildDivisionFingerprint({ ...base, division_id: 'one' })
    );
  });

  it('propagates optional division to every recurring plan', () => {
    expect(addDivisionToRecurringPlans([{ month: 'Jan' }, { month: 'Feb' }], 'division-a')).toEqual([
      { month: 'Jan', division_id: 'division-a' },
      { month: 'Feb', division_id: 'division-a' },
    ]);
  });

  it('resolves only active division belonging to selected department', () => {
    const divisions = [
      { id: 'one', code: 'SALES_A', department_code: 'SALES', is_active: true },
      { id: 'two', code: 'SALES_OLD', department_code: 'SALES', is_active: false },
      { id: 'three', code: 'HR_A', department_code: 'HR', is_active: true },
    ];
    expect(resolveDivisionCode('sales_a', 'SALES', divisions)).toBe('one');
    expect(resolveDivisionCode('SALES_OLD', 'SALES', divisions)).toBe(null);
    expect(resolveDivisionCode('HR_A', 'SALES', divisions)).toBe(null);
  });
});
