import { describe, expect, it } from 'vitest';
import {
  normalizeEffectivePeriod,
  comparePeriods,
  getRestructureDirection,
  buildRestructurePayload,
  getPreviewConflictCount,
  isPreviewCommittable,
  buildRestructureRpcArgs,
  isBackdatedPeriod,
  isBackdateReasonValid,
  buildPreflightChecks,
  hasFailedPreflight,
  describeRestructure,
  buildScopeTimeline,
  resolveRestructureMessage,
  buildSwitchRpcArgs,
  describeSwitch,
  isSwitchCommittable,
} from './scopeRestructureUtils';

const TODAY = new Date(2026, 7, 17); // 17 Aug 2026

describe('scope restructure helpers', () => {
  it('normalizes text and numeric effective months', () => {
    expect(normalizeEffectivePeriod(2027, 'Jan')).toEqual({ year: 2027, month: 1 });
    expect(normalizeEffectivePeriod('2027', 12)).toEqual({ year: 2027, month: 12 });
    expect(normalizeEffectivePeriod(2027, 'Invalid')).toBe(null);
  });

  it('compares periods across year boundaries', () => {
    expect(comparePeriods({ year: 2027, month: 'Jan' }, { year: 2026, month: 'Dec' })).toBe(1);
    expect(comparePeriods({ year: 2026, month: 'Dec' }, { year: 2026, month: 'Dec' })).toBe(0);
  });

  it('accepts only department-to-division or division-to-department', () => {
    expect(getRestructureDirection('department', 'division')).toBe('department_to_division');
    expect(getRestructureDirection('division', 'department')).toBe('division_to_department');
    expect(getRestructureDirection('department', 'department')).toBe(null);
  });

  it('builds normalized RPC payload', () => {
    expect(buildRestructurePayload({
      sourceType: 'department',
      sourceDepartmentCode: 'CMC',
      targetType: 'division',
      targetDepartmentCode: 'SM',
      targetDivisionId: 'division-id',
      effectiveYear: 2027,
      effectiveMonth: 'Jan',
    })).toMatchObject({
      source_scope_type: 'department',
      source_department_code: 'CMC',
      target_scope_type: 'division',
      target_department_code: 'SM',
      target_division_id: 'division-id',
      effective_year: 2027,
      effective_month: 1,
      direction: 'department_to_division',
    });
  });

  it('blocks preview with blocking conflicts', () => {
    expect(getPreviewConflictCount({ valid: true, preview_hash: 'hash', conflicts: [{ blocking: true }, { blocking: false }] })).toBe(1);
    expect(isPreviewCommittable({ valid: true, preview_hash: 'hash', conflicts: [] })).toBe(true);
    expect(isPreviewCommittable({ valid: true, preview_hash: 'hash', conflicts: [{ blocking: true }] })).toBe(false);
  });

  it('builds exact Supabase RPC arguments without client-only direction', () => {
    expect(buildRestructureRpcArgs({
      sourceType: 'department',
      sourceDepartmentCode: 'CMC',
      targetType: 'division',
      targetDepartmentCode: 'SM',
      targetDivisionId: 'division-id',
      effectiveYear: 2027,
      effectiveMonth: 1,
    })).toEqual({
      p_source_scope_type: 'department',
      p_source_department_code: 'CMC',
      p_source_division_id: null,
      p_target_scope_type: 'division',
      p_target_department_code: 'SM',
      p_target_division_id: 'division-id',
      p_effective_year: 2027,
      p_effective_month: 1,
    });
  });

  it('rejects incomplete source or target topology', () => {
    expect(buildRestructureRpcArgs({
      sourceType: 'division',
      sourceDepartmentCode: 'SM',
      sourceDivisionId: '',
      targetType: 'department',
      targetDepartmentCode: 'CMC',
      effectiveYear: 2027,
      effectiveMonth: 1,
    })).toBe(null);
    expect(buildRestructureRpcArgs({
      sourceType: 'department',
      sourceDepartmentCode: 'CMC',
      targetType: 'division',
      targetDepartmentCode: 'SM',
      targetDivisionId: '',
      effectiveYear: 2027,
      effectiveMonth: 1,
    })).toBe(null);
  });
});

describe('backdated scope restructure', () => {
  const backdatedForm = {
    sourceType: 'department',
    sourceDepartmentCode: 'CMC',
    targetType: 'division',
    targetDepartmentCode: 'SM',
    targetDivisionId: 'division-id',
    effectiveYear: 2026,
    effectiveMonth: 6,
  };

  it('detects periods that already closed', () => {
    expect(isBackdatedPeriod({ year: 2026, month: 6 }, TODAY)).toBe(true);
    expect(isBackdatedPeriod({ year: 2026, month: 8 }, TODAY)).toBe(false);
    expect(isBackdatedPeriod({ year: 2026, month: 12 }, TODAY)).toBe(false);
  });

  it('requires a substantive reason before a backdated request is buildable', () => {
    expect(isBackdateReasonValid('short')).toBe(false);
    expect(isBackdateReasonValid('Board decision of 3 June 2026')).toBe(true);
    expect(buildRestructureRpcArgs({ ...backdatedForm, backdateReason: 'oops' }, TODAY)).toBe(null);
    expect(buildRestructureRpcArgs({ ...backdatedForm, backdateReason: '  Board decision of 3 June 2026  ' }, TODAY)).toMatchObject({
      p_effective_year: 2026,
      p_effective_month: 6,
      p_allow_backdate: true,
      p_backdate_reason: 'Board decision of 3 June 2026',
    });
  });

  it('omits backdate arguments for current or future periods', () => {
    const args = buildRestructureRpcArgs({ ...backdatedForm, effectiveMonth: 9, backdateReason: 'ignored reason text' }, TODAY);
    expect(args).not.toHaveProperty('p_allow_backdate');
    expect(args).not.toHaveProperty('p_backdate_reason');
  });
});

describe('one-action scope switch', () => {
  const base = {
    direction: 'to_division',
    sourceDepartmentCode: 'CMC',
    targetDepartmentCode: 'SM',
    newCode: 'cmc',
    newName: 'Corporate Marketing Communication',
    effectiveYear: 2026,
    effectiveMonth: 9,
  };

  it('names the destination instead of picking an existing one', () => {
    expect(buildSwitchRpcArgs(base, TODAY)).toEqual({
      p_direction: 'to_division',
      p_source_department_code: 'CMC',
      p_source_division_id: null,
      p_target_department_code: 'SM',
      p_new_code: 'CMC',
      p_new_name: 'Corporate Marketing Communication',
      p_effective_year: 2026,
      p_effective_month: 9,
    });
  });

  it('refuses a move into itself or with a missing name', () => {
    expect(buildSwitchRpcArgs({ ...base, targetDepartmentCode: 'CMC' }, TODAY)).toBe(null);
    expect(buildSwitchRpcArgs({ ...base, newName: '  ' }, TODAY)).toBe(null);
    expect(buildSwitchRpcArgs({ ...base, direction: 'to_department', sourceDivisionId: '' }, TODAY)).toBe(null);
  });

  it('carries the backdate reason only when the month has closed', () => {
    expect(buildSwitchRpcArgs({ ...base, effectiveMonth: 6 }, TODAY)).toBe(null);
    expect(buildSwitchRpcArgs({ ...base, effectiveMonth: 6, backdateReason: 'Board decision of 3 June 2026' }, TODAY)).toMatchObject({
      p_allow_backdate: true,
      p_backdate_reason: 'Board decision of 3 June 2026',
    });
  });

  it('states both directions in one sentence', () => {
    expect(describeSwitch({
      direction: 'to_division', sourceLabel: 'CMC — Corporate Marketing', parentLabel: 'SM — Sales', newCode: 'CMC', effectiveYear: 2026, effectiveMonth: 6,
    })).toBe('From Jun 2026, CMC — Corporate Marketing becomes division CMC under SM — Sales. Plans before Jun 2026 stay under CMC — Corporate Marketing.');
    expect(describeSwitch({
      direction: 'to_department', sourceLabel: 'CMC — Corporate Marketing', parentLabel: 'SM — Sales', newCode: 'CMC', effectiveYear: 2026, effectiveMonth: 6,
    })).toContain('becomes department CMC');
  });

  it('blocks commit until the server preview is clean', () => {
    expect(isSwitchCommittable({ valid: true, switch_hash: 'hash', conflicts: [] })).toBe(true);
    expect(isSwitchCommittable({ valid: true, switch_hash: 'hash', conflicts: [{ blocking: true }] })).toBe(false);
    expect(isSwitchCommittable(null)).toBe(false);
  });
});

describe('preflight checks', () => {
  const divisions = [
    { id: 'div-1', code: 'CMC_A', department_code: 'CMC', is_active: true },
    { id: 'div-2', code: 'SM_A', department_code: 'SM', is_active: true },
  ];

  it('fails when the demoted department still owns divisions', () => {
    const checks = buildPreflightChecks({
      form: { sourceType: 'department', sourceDepartmentCode: 'CMC', targetType: 'division', targetDepartmentCode: 'SM', targetDivisionId: 'div-2', effectiveYear: 2026, effectiveMonth: 9 },
      divisions,
      today: TODAY,
    });
    const owned = checks.find((check) => check.code === 'SOURCE_DEPARTMENT_HAS_ACTIVE_DIVISIONS');
    expect(owned.status).toBe('fail');
    expect(owned.detail).toContain('CMC_A');
    expect(hasFailedPreflight(checks)).toBe(true);
  });

  it('passes structural checks for a clean department-to-division move', () => {
    const checks = buildPreflightChecks({
      form: { sourceType: 'department', sourceDepartmentCode: 'OPS', targetType: 'division', targetDepartmentCode: 'SM', targetDivisionId: 'div-2', effectiveYear: 2026, effectiveMonth: 9 },
      divisions,
      today: TODAY,
    });
    expect(hasFailedPreflight(checks)).toBe(false);
  });

  it('demands a reason once the effective month is backdated', () => {
    const form = { sourceType: 'department', sourceDepartmentCode: 'OPS', targetType: 'division', targetDepartmentCode: 'SM', targetDivisionId: 'div-2', effectiveYear: 2026, effectiveMonth: 6 };
    expect(hasFailedPreflight(buildPreflightChecks({ form, divisions, today: TODAY }))).toBe(true);
    expect(hasFailedPreflight(buildPreflightChecks({ form: { ...form, backdateReason: 'Board decision of 3 June 2026' }, divisions, today: TODAY }))).toBe(false);
  });

  it('surfaces preview conflicts as failed checks', () => {
    const checks = buildPreflightChecks({
      form: { sourceType: 'department', sourceDepartmentCode: 'OPS', targetType: 'division', targetDepartmentCode: 'SM', targetDivisionId: 'div-2', effectiveYear: 2026, effectiveMonth: 9 },
      divisions,
      preview: { conflicts: [{ code: 'TARGET_PERIOD_HAS_PLANS', blocking: true }] },
      today: TODAY,
    });
    expect(checks.find((check) => check.code === 'TARGET_PERIOD_HAS_PLANS').status).toBe('fail');
  });
});

describe('restructure narration', () => {
  const departments = [{ code: 'CMC', name: 'Corporate Marketing' }, { code: 'SM', name: 'Sales & Marketing' }];
  const divisions = [{ id: 'div-2', code: 'SM_A', name: 'Marketing Division', department_code: 'SM' }];

  it('states the conversion in one sentence', () => {
    expect(describeRestructure({
      form: { sourceType: 'department', sourceDepartmentCode: 'CMC', targetType: 'division', targetDepartmentCode: 'SM', targetDivisionId: 'div-2', effectiveYear: 2026, effectiveMonth: 6 },
      departments,
      divisions,
    })).toBe('From Jun 2026, department CMC — Corporate Marketing becomes division SM_A — Marketing Division under department SM — Sales & Marketing.');
  });

  it('splits the year at the effective month', () => {
    const timeline = buildScopeTimeline({ effectiveYear: 2026, effectiveMonth: 6 });
    expect(timeline).toHaveLength(12);
    expect(timeline[4]).toMatchObject({ month: 'May', scope: 'before' });
    expect(timeline[5]).toMatchObject({ month: 'Jun', scope: 'after' });
  });

  it('turns server error codes into guidance', () => {
    expect(resolveRestructureMessage({ message: 'SOURCE_DEPARTMENT_HAS_ACTIVE_DIVISIONS' })).toMatchObject({
      code: 'SOURCE_DEPARTMENT_HAS_ACTIVE_DIVISIONS',
      title: 'This department still owns divisions',
    });
    expect(resolveRestructureMessage('SOMETHING_ELSE').detail).toContain('without a known reason code');
  });
});
