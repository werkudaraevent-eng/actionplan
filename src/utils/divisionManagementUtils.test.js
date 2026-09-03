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
  summarizeByDivision,
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
    expect(validateDivisionImportValue('COMMS', 'SM', [
      { code: 'COMMS', department_code: 'SM', is_active: true },
    ])).toBe(null);
    expect(validateDivisionImportValue('COMMS', 'SM', [
      { code: 'COMMS', department_code: 'SM', is_active: false },
    ])).toBe('Division COMMS is inactive.');
  });

  it('resolves a shared division code against the row department, not the first match', () => {
    const divisions = [
      { code: 'OPS', department_code: 'HR', is_active: true },
      { code: 'OPS', department_code: 'SM', is_active: true },
    ];
    expect(validateDivisionImportValue('OPS', 'SM', divisions)).toBe(null);
    expect(validateDivisionImportValue('OPS', 'HR', divisions)).toBe(null);
    expect(validateDivisionImportValue('OPS', 'IT', divisions)).toBe('Division OPS belongs to HR, not IT.');
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

describe('summarizeByDivision', () => {
  const divisions = [
    { id: 'comms', code: 'COMMS', name: 'Commercials' },
    { id: 'cmc', code: 'CMC', name: 'Corporate Marketing Communication' },
    { id: 'bs', code: 'BS', name: 'Business Solutions' },
  ];

  it('counts only admin-scored Achieved plans as complete', () => {
    const plans = [
      { division_id: 'comms', status: 'Achieved', quality_score: 90 },
      { division_id: 'comms', status: 'Achieved', quality_score: null },
      { division_id: 'comms', status: 'On Progress' },
      { division_id: 'comms', status: 'Open' },
    ];
    const comms = summarizeByDivision(plans, divisions).find((row) => row.code === 'COMMS');
    expect(comms.total).toBe(4);
    expect(comms.achieved).toBe(2);
    expect(comms.verifiedAchieved).toBe(1);
    expect(comms.pendingVerification).toBe(1);
    expect(comms.completionRate).toBe(25);
  });

  it('keeps a division with no plans in the rollup', () => {
    const rows = summarizeByDivision([{ division_id: 'comms', status: 'Open' }], divisions);
    expect(rows.map((row) => row.code).sort()).toEqual(['BS', 'CMC', 'COMMS']);
    expect(rows.find((row) => row.code === 'BS')).toMatchObject({ total: 0, completionRate: 0, avgScore: null });
  });

  it('omits the department-level bucket when every plan carries a division', () => {
    const rows = summarizeByDivision([{ division_id: 'cmc', status: 'Open' }], divisions);
    expect(rows.some((row) => row.isDepartmentLevel)).toBe(false);
  });

  it('collects unassigned plans into a department-level bucket', () => {
    const rows = summarizeByDivision(
      [{ division_id: null, status: 'Achieved', quality_score: 80 }, { division_id: 'bs', status: 'Open' }],
      divisions
    );
    const departmentLevel = rows.find((row) => row.isDepartmentLevel);
    expect(departmentLevel).toMatchObject({ total: 1, verifiedAchieved: 1, completionRate: 100 });
  });

  it('files a plan pointing at an unknown division under department level rather than dropping it', () => {
    const rows = summarizeByDivision([{ division_id: 'retired-division', status: 'Open' }], divisions);
    expect(rows.reduce((sum, row) => sum + row.total, 0)).toBe(1);
    expect(rows.find((row) => row.isDepartmentLevel).total).toBe(1);
  });

  it('averages only scored plans and reports how many were scored', () => {
    const rows = summarizeByDivision(
      [
        { division_id: 'cmc', status: 'Achieved', quality_score: 100 },
        { division_id: 'cmc', status: 'Not Achieved', quality_score: 50 },
        { division_id: 'cmc', status: 'Open' },
      ],
      divisions
    );
    const cmc = rows.find((row) => row.code === 'CMC');
    expect(cmc.avgScore).toBe(75);
    expect(cmc.scoredCount).toBe(2);
    expect(cmc.notAchieved).toBe(1);
  });

  it('ranks by completion rate, and breaks a tie on volume so an empty division sinks last', () => {
    const plans = [
      { division_id: 'comms', status: 'Achieved', quality_score: 90 },
      { division_id: 'cmc', status: 'Open' },
    ];
    // CMC and BS are both at 0%, but CMC filed a plan and BS filed nothing.
    expect(summarizeByDivision(plans, divisions).map((row) => row.code)).toEqual(['COMMS', 'CMC', 'BS']);
  });

  it('returns nothing to render when the department has no divisions and no plans', () => {
    expect(summarizeByDivision([], [])).toEqual([]);
  });
});
