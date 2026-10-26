import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A stand-in for the Supabase client that records every call in order and answers from `answer`.
const db = vi.hoisted(() => {
  const state = {
    log: [],
    plan: null,
    answer: { tag: null, grade: null, carryOver: null },
  };

  const responseFor = (table, ops) => {
    const update = ops.find(([op]) => op === 'update');
    if (table === 'action_plans' && !update) return { data: [state.plan], error: null };
    if (update && 'gap_category' in update[1] && ops.some(([op]) => op === 'select')) {
      return state.answer.tag ?? { data: [{ id: state.plan.id }], error: null };
    }
    return { data: null, error: null };
  };

  const builder = (table) => {
    const ops = [];
    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') {
          const update = ops.find(([op]) => op === 'update');
          const insert = ops.find(([op]) => op === 'insert');
          if (update) state.log.push({ kind: 'update', table, values: update[1] });
          if (insert) state.log.push({ kind: 'insert', table, values: insert[1] });
          const response = responseFor(table, ops);
          return (resolve, reject) => Promise.resolve(response).then(resolve, reject);
        }
        return (...args) => { ops.push([prop, ...args]); return chain; };
      },
    });
    return chain;
  };

  const client = {
    from: (table) => builder(table),
    rpc: (name, args) => {
      state.log.push({ kind: 'rpc', name, args });
      if (name === 'grade_action_plan') return Promise.resolve(state.answer.grade);
      if (name === 'carry_over_plan') return Promise.resolve(state.answer.carryOver ?? { data: { next_month: 'May' }, error: null });
      return Promise.resolve({ data: null, error: null });
    },
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: () => {},
  };

  return { state, client };
});

vi.mock('../lib/supabase', () => ({
  supabase: db.client,
  withTimeout: (promise) => promise,
}));
vi.mock('../utils/usageTracking', () => ({ trackEvent: vi.fn() }));

import { useActionPlans } from './useActionPlans';

const PLAN_ID = 'plan-1';
const gradeAsNotAchieved = (overrides = {}) => ({
  status: 'Not Achieved',
  quality_score: 85,
  admin_feedback: 'Evidence does not show the full target',
  reviewed_by: 'reviewer-1',
  reviewed_at: '2026-10-26T00:00:00.000Z',
  _verdict: 'carry_over',
  _failureReason: { gap_category: 'Timeline / Scheduling Conflict', specify_reason: null },
  ...overrides,
});

async function renderLoaded() {
  const hook = renderHook(() => useActionPlans(null, 'company-1'));
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  await waitFor(() => expect(hook.result.current.plans).toHaveLength(1));
  db.state.log.length = 0;
  return hook;
}

const steps = () => db.state.log.map((entry) => {
  if (entry.kind === 'rpc') return `rpc ${entry.name}`;
  if (entry.kind === 'update' && 'gap_category' in entry.values) return `reason ${entry.values.gap_category}`;
  return `${entry.kind} ${entry.table}`;
});

beforeEach(() => {
  db.state.log.length = 0;
  db.state.plan = {
    id: PLAN_ID, status: 'Achieved', submission_status: 'submitted', category: 'H (High)',
    month: 'Apr', year: 2026, gap_category: null, specify_reason: null, quality_score: null,
  };
  db.state.answer = {
    tag: null,
    grade: { data: { success: true, final_status: 'Not Achieved', final_score: 85 }, error: null },
    carryOver: null,
  };
});

describe('gradePlan with a reviewer-picked failure reason', () => {
  it('writes the reason before grading, so the status change is audited with it', async () => {
    const { result } = await renderLoaded();

    await act(() => result.current.gradePlan(PLAN_ID, gradeAsNotAchieved()));

    const order = steps();
    expect(order.indexOf('reason Timeline / Scheduling Conflict')).toBeLessThan(order.indexOf('rpc grade_action_plan'));
    expect(order).toContain('rpc carry_over_plan');
    expect(order.filter((step) => step === 'reason null')).toHaveLength(0);
  });

  it('only tags a plan that is still submitted', async () => {
    db.state.answer.tag = { data: [], error: null };
    const { result } = await renderLoaded();

    await expect(result.current.gradePlan(PLAN_ID, gradeAsNotAchieved())).rejects.toMatchObject({ code: 'ITEM_RECALLED' });
    expect(steps()).not.toContain('rpc grade_action_plan');
  });

  it('puts the reason back when grading fails', async () => {
    db.state.answer.grade = { data: null, error: { message: 'boom' } };
    const { result } = await renderLoaded();

    await expect(result.current.gradePlan(PLAN_ID, gradeAsNotAchieved())).rejects.toMatchObject({ message: 'boom' });
    const order = steps();
    expect(order.lastIndexOf('reason null')).toBeGreaterThan(order.indexOf('rpc grade_action_plan'));
  });

  it('puts the reason back when the grade does not end Not Achieved', async () => {
    db.state.answer.grade = { data: { success: true, final_status: 'Achieved', final_score: 85 }, error: null };
    const { result } = await renderLoaded();

    await act(() => result.current.gradePlan(PLAN_ID, gradeAsNotAchieved()));

    expect(steps()).toContain('reason null');
  });

  it('records the reason on the drop audit entry', async () => {
    const { result } = await renderLoaded();

    await act(() => result.current.gradePlan(PLAN_ID, gradeAsNotAchieved({ _verdict: 'failed' })));

    const audit = db.state.log.find((entry) => entry.kind === 'insert' && entry.table === 'audit_logs');
    expect(audit.values.new_value).toMatchObject({ verdict: 'dropped_by_admin', gap_category: 'Timeline / Scheduling Conflict' });
  });

  it('leaves the reason alone when none was picked', async () => {
    const { result } = await renderLoaded();

    await act(() => result.current.gradePlan(PLAN_ID, gradeAsNotAchieved({ _failureReason: undefined })));

    expect(steps().some((step) => step.startsWith('reason'))).toBe(false);
    const gradeCall = db.state.log.find((entry) => entry.kind === 'rpc' && entry.name === 'grade_action_plan');
    expect(gradeCall.args).not.toHaveProperty('_failureReason');
  });
});
