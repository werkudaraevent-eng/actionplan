export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const BACKDATE_REASON_MIN_LENGTH = 10;

export function normalizeEffectivePeriod(year, month) {
  const normalizedYear = Number(year);
  const normalizedMonth = typeof month === 'number' ? month : MONTHS.indexOf(String(month).trim()) + 1;
  if (!Number.isInteger(normalizedYear) || normalizedYear < 2020 || normalizedYear > 2100) return null;
  if (!Number.isInteger(normalizedMonth) || normalizedMonth < 1 || normalizedMonth > 12) return null;
  return { year: normalizedYear, month: normalizedMonth };
}

export function comparePeriods(left, right) {
  const leftPeriod = normalizeEffectivePeriod(left?.year, left?.month);
  const rightPeriod = normalizeEffectivePeriod(right?.year, right?.month);
  if (!leftPeriod || !rightPeriod) return null;
  return (leftPeriod.year * 12 + leftPeriod.month) - (rightPeriod.year * 12 + rightPeriod.month);
}

export function getRestructureDirection(sourceType, targetType) {
  if (sourceType === 'department' && targetType === 'division') return 'department_to_division';
  if (sourceType === 'division' && targetType === 'department') return 'division_to_department';
  return null;
}

/** A period earlier than the current month rewrites scope for months that already closed. */
export function isBackdatedPeriod(period, today = new Date()) {
  const normalized = normalizeEffectivePeriod(period?.year, period?.month);
  if (!normalized) return false;
  return normalized.year * 12 + normalized.month < today.getFullYear() * 12 + today.getMonth() + 1;
}

export function isBackdateReasonValid(reason) {
  return String(reason || '').trim().length >= BACKDATE_REASON_MIN_LENGTH;
}

export function buildRestructurePayload(input) {
  const direction = getRestructureDirection(input?.sourceType, input?.targetType);
  const period = normalizeEffectivePeriod(input?.effectiveYear, input?.effectiveMonth);
  if (!direction || !period) return null;
  return {
    source_scope_type: input.sourceType,
    source_department_code: input.sourceDepartmentCode || null,
    source_division_id: input.sourceDivisionId || null,
    target_scope_type: input.targetType,
    target_department_code: input.targetDepartmentCode || null,
    target_division_id: input.targetDivisionId || null,
    effective_year: period.year,
    effective_month: period.month,
    direction,
  };
}

export function buildRestructureRpcArgs(input, today = new Date()) {
  const payload = buildRestructurePayload(input);
  if (!payload?.source_department_code || !payload?.target_department_code) return null;
  if (payload.source_scope_type === 'division' && !payload.source_division_id) return null;
  if (payload.target_scope_type === 'division' && !payload.target_division_id) return null;

  const args = {
    p_source_scope_type: payload.source_scope_type,
    p_source_department_code: payload.source_department_code,
    p_source_division_id: payload.source_division_id,
    p_target_scope_type: payload.target_scope_type,
    p_target_department_code: payload.target_department_code,
    p_target_division_id: payload.target_division_id,
    p_effective_year: payload.effective_year,
    p_effective_month: payload.effective_month,
  };

  // Backdating is opt-in per request: the reason travels with every call so the
  // server can journal why a closed period was rewritten.
  if (isBackdatedPeriod({ year: payload.effective_year, month: payload.effective_month }, today)) {
    if (!isBackdateReasonValid(input?.backdateReason)) return null;
    args.p_allow_backdate = true;
    args.p_backdate_reason = String(input.backdateReason).trim();
  }

  return args;
}

/**
 * The switch RPCs take the destination by name instead of by id: the division or
 * department it becomes is created inside the same transaction, so there is nothing to
 * pick beforehand.
 */
export function buildSwitchRpcArgs(input, today = new Date()) {
  const period = normalizeEffectivePeriod(input?.effectiveYear, input?.effectiveMonth);
  const newCode = String(input?.newCode || '').trim().toUpperCase();
  const newName = String(input?.newName || '').trim();
  if (!period || !newCode || !newName) return null;
  if (input?.direction === 'to_division' && (!input?.sourceDepartmentCode || !input?.targetDepartmentCode)) return null;
  if (input?.direction === 'to_department' && !input?.sourceDivisionId) return null;
  if (input?.direction === 'to_division' && input.sourceDepartmentCode === input.targetDepartmentCode) return null;

  const args = {
    p_direction: input.direction,
    p_source_department_code: input.sourceDepartmentCode || null,
    p_source_division_id: input.sourceDivisionId || null,
    p_target_department_code: input.direction === 'to_division' ? input.targetDepartmentCode : null,
    p_new_code: newCode,
    p_new_name: newName,
    p_effective_year: period.year,
    p_effective_month: period.month,
  };

  if (isBackdatedPeriod(period, today)) {
    if (!isBackdateReasonValid(input?.backdateReason)) return null;
    args.p_allow_backdate = true;
    args.p_backdate_reason = String(input.backdateReason).trim();
  }

  return args;
}

export function isSwitchCommittable(preview) {
  return Boolean(preview?.valid && preview?.switch_hash && getPreviewConflictCount(preview) === 0);
}

export function describeSwitch({ direction, sourceLabel, parentLabel, newCode, effectiveYear, effectiveMonth }) {
  const period = normalizeEffectivePeriod(effectiveYear, effectiveMonth);
  if (!period || !sourceLabel) return '';
  const from = `${MONTHS[period.month - 1]} ${period.year}`;
  if (direction === 'to_division') {
    return `From ${from}, ${sourceLabel} becomes division ${newCode || '…'} under ${parentLabel || '…'}. Plans before ${from} stay under ${sourceLabel}.`;
  }
  return `From ${from}, ${sourceLabel} leaves ${parentLabel || 'its department'} and becomes department ${newCode || '…'}. Plans before ${from} stay under ${parentLabel || 'its department'}.`;
}

export function getPreviewConflictCount(preview) {
  return (preview?.conflicts || []).filter((conflict) => conflict.blocking !== false).length;
}

export function isPreviewCommittable(preview) {
  return Boolean(preview?.valid && preview?.preview_hash && getPreviewConflictCount(preview) === 0);
}

/** Server error codes carry no guidance on their own; each one gets a cause and a way out. */
export const RESTRUCTURE_MESSAGE_GUIDE = {
  SOURCE_DEPARTMENT_HAS_ACTIVE_DIVISIONS: {
    title: 'This department still owns divisions',
    detail: 'A department that has its own divisions cannot become a division. The hierarchy is only two levels deep. Move or deactivate its divisions first.',
    fix: 'Open Departments and clear the divisions under it.',
  },
  TARGET_DEPARTMENT_HAS_ACTIVE_DIVISIONS: {
    title: 'The target department still owns divisions',
    detail: 'A division can only be promoted into a department that has no divisions of its own.',
    fix: 'Open Departments and clear the divisions under the target.',
  },
  TARGET_DIVISION_NOT_FOUND: {
    title: 'Target division not found',
    detail: 'The division must already exist under the parent department and be active.',
    fix: 'Create the division in step 2 before continuing.',
  },
  SOURCE_DIVISION_NOT_FOUND: {
    title: 'Source division not found',
    detail: 'The division must exist under the selected department and be active.',
    fix: 'Pick another division, or reactivate it in Departments.',
  },
  SOURCE_AND_TARGET_SCOPE_SAME: {
    title: 'Source and target are the same unit',
    detail: 'A department cannot become a division of itself.',
    fix: 'Pick a different parent department.',
  },
  EFFECTIVE_PERIOD_MUST_BE_CURRENT_OR_FUTURE: {
    title: 'That month has already closed',
    detail: 'Normal conversions only run from the current month onward.',
    fix: 'Turn on backdated conversion in step 3 and state the reason.',
  },
  BACKDATE_REASON_REQUIRED: {
    title: 'A backdated conversion needs a written reason',
    detail: `Rewriting a closed period is recorded in the audit journal, so it must carry at least ${BACKDATE_REASON_MIN_LENGTH} characters of explanation.`,
    fix: 'Describe why the change applies from that month.',
  },
  BACKDATE_PERIOD_TOO_OLD: {
    title: 'That month is more than two years back',
    detail: 'Backdating is capped at 24 months to keep long-closed reporting periods intact.',
    fix: 'Pick a later effective month.',
  },
  RESTRUCTURE_PREVIEW_STALE: {
    title: 'The data changed while you were reviewing',
    detail: 'Someone edited plans or assignments after this preview was generated, so it was rejected instead of applied.',
    fix: 'Run the preview again.',
  },
  RESTRUCTURE_PREVIEW_CONFLICT: {
    title: 'Blocking conflicts are still open',
    detail: 'The conversion was refused because at least one blocking conflict remained.',
    fix: 'Clear the conflicts listed in the review step.',
  },
  RESTRUCTURE_ADMIN_REQUIRED: {
    title: 'Admin access required',
    detail: 'Only a company admin or holding admin can convert organization scope.',
    fix: '',
  },
  RESTRUCTURE_ROLLBACK_CONFLICT: {
    title: 'This operation can no longer be rolled back safely',
    detail: 'Plans or assignments changed after the conversion was applied, so restoring the old scope would overwrite newer edits.',
    fix: 'Correct the scope manually instead.',
  },
  RESTRUCTURE_ALREADY_ROLLED_BACK: {
    title: 'Already rolled back',
    detail: 'This operation was reversed earlier.',
    fix: '',
  },
  ROLLBACK_REASON_REQUIRED: {
    title: 'A rollback needs a reason',
    detail: 'The reason is written to the audit journal.',
    fix: '',
  },
  TARGET_PERIOD_HAS_PLANS: {
    title: 'The target scope already has plans in this period',
    detail: 'Merging two sets of plans into one scope would make the affected months ambiguous and the conversion irreversible.',
    fix: 'Pick an empty division, or move those plans out first.',
  },
  NON_DRAFT_SOURCE_PLAN: {
    title: 'Some plans in range are already submitted',
    detail: 'A normal conversion only moves drafts, so submitted or closed plans block it.',
    fix: 'Reopen those plans, or use a backdated conversion which moves them too.',
  },
  DIVISION_CODE_TAKEN: {
    title: 'That division code already exists under the parent',
    detail: 'Division codes must be unique inside a department.',
    fix: 'Pick a different code.',
  },
  DEPARTMENT_CODE_TAKEN: {
    title: 'That department code already exists',
    detail: 'Department codes must be unique inside the company, including archived ones.',
    fix: 'Pick a different code.',
  },
  INVALID_SWITCH_REQUEST: {
    title: 'The move is missing a code or a name',
    detail: 'Both a code and a display name are required for the unit being created.',
    fix: 'Fill in both fields.',
  },
  BACKDATE_MOVES_SUBMITTED_PLANS: {
    title: 'Submitted plans will move as well',
    detail: 'This backdated conversion also moves plans that were already submitted or closed. Reports for those months will show the new scope.',
    fix: '',
  },
};

export function resolveRestructureMessage(codeOrError) {
  const raw = typeof codeOrError === 'string' ? codeOrError : (codeOrError?.message || codeOrError?.code || '');
  const code = String(raw).trim();
  const guide = RESTRUCTURE_MESSAGE_GUIDE[code];
  if (guide) return { code, ...guide };
  return {
    code: code || 'UNKNOWN_ERROR',
    title: code ? code.replaceAll('_', ' ').toLowerCase() : 'Unexpected error',
    detail: 'The server rejected the request without a known reason code.',
    fix: '',
  };
}

/**
 * Structural checks the client can answer from already-loaded master data, so the
 * admin sees why a conversion is impossible before submitting it.
 */
export function buildPreflightChecks({ form, divisions = [], preview = null, today = new Date() }) {
  const checks = [];
  const activeDivisions = divisions.filter((division) => division.is_active !== false);
  const sourceType = form?.sourceType;
  const targetType = form?.targetType;
  const sourceDepartment = form?.sourceDepartmentCode;
  const targetDepartment = form?.targetDepartmentCode;

  const sourceSelected = Boolean(sourceDepartment) && (sourceType !== 'division' || Boolean(form?.sourceDivisionId));
  checks.push({
    code: 'SOURCE_SELECTED',
    status: sourceSelected ? 'pass' : 'pending',
    label: sourceType === 'division' ? 'Division to promote is selected' : 'Department to convert is selected',
  });

  const targetSelected = Boolean(targetDepartment) && (targetType !== 'division' || Boolean(form?.targetDivisionId));
  checks.push({
    code: 'TARGET_SELECTED',
    status: targetSelected ? 'pass' : 'pending',
    label: targetType === 'division' ? 'Parent department and new division are selected' : 'Standalone department is selected',
  });

  if (sourceType === 'department' && sourceDepartment) {
    const owned = activeDivisions.filter((division) => division.department_code === sourceDepartment);
    checks.push({
      code: 'SOURCE_DEPARTMENT_HAS_ACTIVE_DIVISIONS',
      status: owned.length === 0 ? 'pass' : 'fail',
      label: `${sourceDepartment} has no divisions of its own`,
      detail: owned.length > 0 ? `Still owns ${owned.map((division) => division.code).join(', ')}.` : '',
    });
  }

  if (targetType === 'department' && targetDepartment) {
    const owned = activeDivisions.filter((division) => division.department_code === targetDepartment);
    checks.push({
      code: 'TARGET_DEPARTMENT_HAS_ACTIVE_DIVISIONS',
      status: owned.length === 0 ? 'pass' : 'fail',
      label: `${targetDepartment} has no divisions of its own`,
      detail: owned.length > 0 ? `Still owns ${owned.map((division) => division.code).join(', ')}.` : '',
    });
  }

  if (sourceType === 'department' && sourceDepartment && targetDepartment) {
    checks.push({
      code: 'SOURCE_AND_TARGET_SCOPE_SAME',
      status: sourceDepartment === targetDepartment ? 'fail' : 'pass',
      label: 'Source and parent department are different units',
    });
  }

  const period = normalizeEffectivePeriod(form?.effectiveYear, form?.effectiveMonth);
  const backdated = isBackdatedPeriod(period, today);
  if (period && backdated) {
    checks.push({
      code: 'BACKDATE_REASON_REQUIRED',
      status: isBackdateReasonValid(form?.backdateReason) ? 'pass' : 'fail',
      label: 'Backdated conversion has a written reason',
      detail: `At least ${BACKDATE_REASON_MIN_LENGTH} characters.`,
    });
  }

  if (preview) {
    const conflictCodes = new Set((preview.conflicts || []).map((conflict) => conflict.code));
    checks.push({
      code: 'TARGET_PERIOD_HAS_PLANS',
      status: conflictCodes.has('TARGET_PERIOD_HAS_PLANS') ? 'fail' : 'pass',
      label: 'Target scope has no plans in the affected months',
    });
    checks.push({
      code: 'NON_DRAFT_SOURCE_PLAN',
      status: conflictCodes.has('NON_DRAFT_SOURCE_PLAN') ? 'fail' : 'pass',
      label: backdated ? 'Submitted plans are allowed to move' : 'Every plan in range is still a draft',
    });
  }

  return checks;
}

export function hasFailedPreflight(checks) {
  return (checks || []).some((check) => check.status === 'fail');
}

/** Plain-language restatement of the conversion, shown before anything is applied. */
export function describeRestructure({ form, departments = [], divisions = [] }) {
  const period = normalizeEffectivePeriod(form?.effectiveYear, form?.effectiveMonth);
  const direction = getRestructureDirection(form?.sourceType, form?.targetType);
  if (!period || !direction) return '';

  const departmentName = (code) => {
    const match = departments.find((department) => department.code === code);
    return match ? `${match.code} — ${match.name}` : code;
  };
  const divisionName = (id) => {
    const match = divisions.find((division) => division.id === id);
    return match ? `${match.code} — ${match.name}` : 'the selected division';
  };

  const from = `${MONTHS[period.month - 1]} ${period.year}`;
  if (direction === 'department_to_division') {
    if (!form?.sourceDepartmentCode || !form?.targetDivisionId) return '';
    return `From ${from}, department ${departmentName(form.sourceDepartmentCode)} becomes division ${divisionName(form.targetDivisionId)} under department ${departmentName(form.targetDepartmentCode)}.`;
  }
  if (!form?.sourceDivisionId || !form?.targetDepartmentCode) return '';
  return `From ${from}, division ${divisionName(form.sourceDivisionId)} leaves department ${departmentName(form.sourceDepartmentCode)} and becomes standalone department ${departmentName(form.targetDepartmentCode)}.`;
}

/** Month strip for the effective year: which months keep the old scope, which take the new one. */
export function buildScopeTimeline(form) {
  const period = normalizeEffectivePeriod(form?.effectiveYear, form?.effectiveMonth);
  if (!period) return [];
  return MONTHS.map((month, index) => ({
    month,
    monthNumber: index + 1,
    scope: index + 1 >= period.month ? 'after' : 'before',
  }));
}
