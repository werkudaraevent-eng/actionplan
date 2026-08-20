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

  const division = (divisions || []).find((item) => item.code === code);
  if (!division) return `Unknown or inactive division: ${code}.`;
  if (!division.is_active) return `Division ${code} is inactive.`;
  if (division.department_code !== departmentCode) {
    return `Division ${code} belongs to ${division.department_code}, not ${departmentCode}.`;
  }
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
