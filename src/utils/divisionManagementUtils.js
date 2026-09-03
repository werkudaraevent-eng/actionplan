export function buildDivisionSettings(row) {
  return {
    division_hierarchy_enabled: row?.division_hierarchy_enabled === true,
    division_readiness_policy: row?.division_readiness_policy === 'REQUIRED' ? 'REQUIRED' : 'ADVISORY',
  };
}

export function filterCompanyRows(rows, companyId) {
  return (rows || []).filter((row) => row.company_id === companyId);
}

export function getDivisionMemberCount(memberships, divisionId) {
  return (memberships || []).filter((membership) => membership.division_id === divisionId).length;
}

export function getDivisionOptions(divisions, departmentCode) {
  return [
    { value: '', label: 'Department level' },
    ...(divisions || [])
      .filter((division) => division.is_active && (!departmentCode || division.department_code === departmentCode))
      .map((division) => ({ value: division.id, label: division.code })),
  ];
}

export function filterPlansByDivision(plans, divisionId) {
  if (!divisionId) return plans || [];
  return (plans || []).filter((plan) => !plan.division_id || plan.division_id === divisionId);
}

export function validateDivisionImportValue(rawCode, departmentCode, divisions) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;

  // Division codes are only unique inside a department, so the row's own department
  // decides which one it means; a match elsewhere is reported, not silently accepted.
  const all = divisions || [];
  const division = all.find((item) => item.code === code && item.department_code === departmentCode)
    || all.find((item) => item.code === code);
  if (!division) return `Unknown or inactive division: ${code}.`;
  if (division.department_code !== departmentCode) {
    return `Division ${code} belongs to ${division.department_code}, not ${departmentCode}.`;
  }
  if (!division.is_active) return `Division ${code} is inactive.`;
  return null;
}

export function buildDivisionFingerprint(plan) {
  return [
    plan?.division_id || '',
    plan?.department_code || '',
    plan?.category || '',
    plan?.area_focus || '',
    plan?.goal_strategy || '',
    plan?.action_plan || '',
    plan?.indicator || '',
    plan?.evidence || '',
    (plan?.pic_ids || []).slice().sort().join(',') || plan?.legacy_pic_text || plan?.pic || '',
  ].map((value) => String(value || '').trim().toLowerCase()).join('|');
}

export function addDivisionToRecurringPlans(plans, divisionId) {
  return (plans || []).map((plan) => ({
    ...plan,
    division_id: divisionId || null,
  }));
}

export function resolveDivisionCode(rawCode, departmentCode, divisions) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) return null;
  const division = (divisions || []).find(
    (item) => item.code === code && item.is_active && item.department_code === departmentCode
  );
  return division?.id || null;
}

/**
 * Per-division rollup for the dashboards.
 *
 * Buckets are the divisions passed in, plus one "Department level" bucket for plans
 * that carry no division_id. Every division is returned even when it has no plans,
 * because an empty division is itself the signal a dashboard needs to show — a unit
 * that filed nothing must not silently vanish from the ranking.
 *
 * Completion follows `isVerifiedAchieved`: an admin-scored 'Achieved'. A plan the PIC
 * marked Achieved but that is still unscored counts as pending, never as complete, so
 * these figures agree with the KPI cards above them.
 *
 * @param {Array} plans      — already filtered to the period the dashboard is showing
 * @param {Array} divisions  — divisions of the department in view
 * @returns {Array} one row per bucket, sorted by completion rate descending
 */
export function summarizeByDivision(plans, divisions) {
  const buckets = new Map();

  for (const division of divisions || []) {
    buckets.set(division.id, {
      divisionId: division.id,
      code: division.code,
      name: division.name || division.code,
      isDepartmentLevel: false,
      total: 0,
      achieved: 0,
      verifiedAchieved: 0,
      pendingVerification: 0,
      inProgress: 0,
      open: 0,
      notAchieved: 0,
      scores: [],
    });
  }

  const DEPARTMENT_LEVEL = '__department_level__';
  const departmentBucket = {
    divisionId: null,
    code: 'Department level',
    name: 'Plans not assigned to a division',
    isDepartmentLevel: true,
    total: 0,
    achieved: 0,
    verifiedAchieved: 0,
    pendingVerification: 0,
    inProgress: 0,
    open: 0,
    notAchieved: 0,
    scores: [],
  };
  buckets.set(DEPARTMENT_LEVEL, departmentBucket);

  for (const plan of plans || []) {
    // A plan pointing at a division that is inactive or belongs to another department
    // has no bucket of its own; it falls to department level rather than being dropped,
    // so the rollup always adds back up to the plan count on the KPI cards.
    const key = plan?.division_id && buckets.has(plan.division_id) ? plan.division_id : DEPARTMENT_LEVEL;
    const bucket = buckets.get(key);

    bucket.total += 1;
    if (plan?.status === 'Achieved') {
      bucket.achieved += 1;
      if (plan?.quality_score != null) bucket.verifiedAchieved += 1;
      else bucket.pendingVerification += 1;
    } else if (plan?.status === 'On Progress') {
      bucket.inProgress += 1;
    } else if (plan?.status === 'Open') {
      bucket.open += 1;
    } else if (plan?.status === 'Not Achieved') {
      bucket.notAchieved += 1;
    }

    if (plan?.quality_score != null) bucket.scores.push(Number(plan.quality_score));
  }

  return [...buckets.values()]
    // The department-level bucket is noise for a department that assigns every plan.
    .filter((bucket) => !bucket.isDepartmentLevel || bucket.total > 0)
    .map((bucket) => ({
      divisionId: bucket.divisionId,
      code: bucket.code,
      name: bucket.name,
      isDepartmentLevel: bucket.isDepartmentLevel,
      total: bucket.total,
      achieved: bucket.achieved,
      verifiedAchieved: bucket.verifiedAchieved,
      pendingVerification: bucket.pendingVerification,
      inProgress: bucket.inProgress,
      open: bucket.open,
      notAchieved: bucket.notAchieved,
      completionRate: bucket.total > 0
        ? Number(((bucket.verifiedAchieved / bucket.total) * 100).toFixed(1))
        : 0,
      avgScore: bucket.scores.length > 0
        ? Number((bucket.scores.reduce((sum, score) => sum + score, 0) / bucket.scores.length).toFixed(1))
        : null,
      scoredCount: bucket.scores.length,
    }))
    .sort((a, b) => b.completionRate - a.completionRate || b.total - a.total);
}
