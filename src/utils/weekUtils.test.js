import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  getWeekRange,
  getWeekNumber,
  getActivityColor,
  filterPlansByWeek,
  groupByDepartment,
  groupByDayOfWeek,
} from './weekUtils';

/**
 * Feature: weekly-activity-chart-upgrade
 * Property-based tests for week utility functions
 */

describe('Week Utility Functions - Property Tests', () => {
  
  // Property 1: Week Navigation Symmetry
  // For any date, navigating prev then next returns to same week
  describe('Property 1: Week Navigation Symmetry', () => {
    it('navigating prev week then next week returns to same week boundaries', () => {
      // Use integer-based date generation to avoid invalid dates
      const validDateArb = fc.integer({ min: 1577836800000, max: 1798761600000 })
        .map(ts => new Date(ts));
      
      fc.assert(
        fc.property(
          validDateArb,
          (date) => {
            const original = getWeekRange(date);
            
            // Navigate to previous week
            const prevDate = new Date(date);
            prevDate.setDate(prevDate.getDate() - 7);
            
            // Navigate back to next week
            const nextDate = new Date(prevDate);
            nextDate.setDate(nextDate.getDate() + 7);
            
            const result = getWeekRange(nextDate);
            
            // Should return to same week boundaries
            expect(result.startOfWeek.getTime()).toBe(original.startOfWeek.getTime());
            expect(result.endOfWeek.getTime()).toBe(original.endOfWeek.getTime());
          }
        ),
        { numRuns: 100 }
      );
    });
    // **Validates: Requirements 1.2, 1.3**
  });

  // Property 2: Week Range Validity
  // For any date, startOfWeek is Monday and endOfWeek is Sunday, 6 days apart
  describe('Property 2: Week Range Validity', () => {
    it('startOfWeek is always Monday and endOfWeek is always Sunday', () => {
      const validDateArb = fc.integer({ min: 1577836800000, max: 1798761600000 })
        .map(ts => new Date(ts));
      
      fc.assert(
        fc.property(
          validDateArb,
          (date) => {
            const { startOfWeek, endOfWeek } = getWeekRange(date);
            
            // Monday = 1, Sunday = 0
            expect(startOfWeek.getDay()).toBe(1); // Monday
            expect(endOfWeek.getDay()).toBe(0);   // Sunday
          }
        ),
        { numRuns: 100 }
      );
    });

    it('week range spans exactly 6 days', () => {
      const validDateArb = fc.integer({ min: 1577836800000, max: 1798761600000 })
        .map(ts => new Date(ts));
      
      fc.assert(
        fc.property(
          validDateArb,
          (date) => {
            const { startOfWeek, endOfWeek } = getWeekRange(date);
            
            // Calculate days between (should be 6)
            const diffTime = endOfWeek.getTime() - startOfWeek.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            expect(diffDays).toBe(6);
          }
        ),
        { numRuns: 100 }
      );
    });
    // **Validates: Requirements 1.4, 3.1**
  });

  // Property 3: Week Number Consistency
  // All dates in the same week should return the same week number
  describe('Property 3: Week Number Consistency', () => {
    it('all dates within a week have the same week number', () => {
      const validDateArb = fc.integer({ min: 1577836800000, max: 1798761600000 })
        .map(ts => new Date(ts));
      
      fc.assert(
        fc.property(
          validDateArb,
          (date) => {
            const { startOfWeek, endOfWeek } = getWeekRange(date);
            const weekNum = getWeekNumber(date);
            
            // Check all days in the week
            for (let d = new Date(startOfWeek); d <= endOfWeek; d.setDate(d.getDate() + 1)) {
              expect(getWeekNumber(new Date(d))).toBe(weekNum);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    // **Validates: Requirements 1.5**
  });

  // Property 4: Data Filtering Correctness
  // All filtered items should have updated_at within the week range
  describe('Property 4: Data Filtering Correctness', () => {
    it('all filtered plans have updated_at within week range', () => {
      // Use integer-based date generation to avoid invalid dates
      const validDateArb = fc.integer({ min: 1577836800000, max: 1798761600000 }) // 2020-01-01 to 2027-01-01
        .map(ts => new Date(ts).toISOString());
      
      const planArb = fc.record({
        id: fc.uuid(),
        department_code: fc.constantFrom('BAS', 'HR', 'IT', 'FIN'),
        updated_at: fc.option(validDateArb, { nil: undefined }),
      });

      fc.assert(
        fc.property(
          fc.array(planArb, { minLength: 0, maxLength: 50 }),
          fc.integer({ min: 1577836800000, max: 1798761600000 }).map(ts => new Date(ts)),
          (plans, date) => {
            const { startOfWeek, endOfWeek } = getWeekRange(date);
            const filtered = filterPlansByWeek(plans, startOfWeek, endOfWeek);
            
            // All filtered items should be within range
            filtered.forEach(plan => {
              const updateDate = new Date(plan.updated_at);
              expect(updateDate >= startOfWeek).toBe(true);
              expect(updateDate <= endOfWeek).toBe(true);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
    // **Validates: Requirements 3.2**
  });

  // Property 5: Grouping Preserves Total Count
  // Sum of grouped values equals total filtered records
  describe('Property 5: Grouping Preserves Total Count', () => {
    it('department grouping preserves total count', () => {
      const validDateArb = fc.integer({ min: 1577836800000, max: 1798761600000 })
        .map(ts => new Date(ts).toISOString());
      
      const planArb = fc.record({
        id: fc.uuid(),
        department_code: fc.constantFrom('BAS', 'HR', 'IT', 'FIN', 'OPS'),
        updated_at: validDateArb,
      });

      fc.assert(
        fc.property(
          fc.array(planArb, { minLength: 0, maxLength: 50 }),
          (plans) => {
            const grouped = groupByDepartment(plans);
            const totalFromGroups = grouped.reduce((sum, item) => sum + item.value, 0);
            
            expect(totalFromGroups).toBe(plans.length);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('daily grouping preserves total count', () => {
      const validDateArb = fc.integer({ min: 1577836800000, max: 1798761600000 })
        .map(ts => new Date(ts).toISOString());
      
      const planArb = fc.record({
        id: fc.uuid(),
        department_code: fc.constantFrom('BAS', 'HR', 'IT'),
        updated_at: validDateArb,
      });

      fc.assert(
        fc.property(
          fc.array(planArb, { minLength: 0, maxLength: 50 }),
          (plans) => {
            const grouped = groupByDayOfWeek(plans);
            const totalFromGroups = grouped.reduce((sum, item) => sum + item.value, 0);
            
            expect(totalFromGroups).toBe(plans.length);
          }
        ),
        { numRuns: 100 }
      );
    });
    // **Validates: Requirements 4.1, 5.1**
  });

  // Property 6: Department Data Sorting
  // Chart data is sorted by value descending
  describe('Property 6: Department Data Sorting', () => {
    it('department chart data is sorted by value descending', () => {
      const validDateArb = fc.integer({ min: 1577836800000, max: 1798761600000 })
        .map(ts => new Date(ts).toISOString());
      
      const planArb = fc.record({
        id: fc.uuid(),
        department_code: fc.constantFrom('BAS', 'HR', 'IT', 'FIN', 'OPS', 'MKT'),
        updated_at: validDateArb,
      });

      fc.assert(
        fc.property(
          fc.array(planArb, { minLength: 2, maxLength: 50 }),
          (plans) => {
            const grouped = groupByDepartment(plans);
            
            // Check descending order
            for (let i = 0; i < grouped.length - 1; i++) {
              expect(grouped[i].value).toBeGreaterThanOrEqual(grouped[i + 1].value);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    // **Validates: Requirements 4.3**
  });

  // Property 7: Color Assignment Thresholds
  // Correct color based on activity thresholds
  describe('Property 7: Color Assignment Thresholds', () => {
    it('assigns correct color based on count thresholds', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100 }),
          (count) => {
            const color = getActivityColor(count);
            
            if (count >= 10) {
              expect(color).toBe('#059669'); // green
            } else if (count >= 5) {
              expect(color).toBe('#3b82f6'); // blue
            } else if (count > 0) {
              expect(color).toBe('#f59e0b'); // amber
            } else {
              expect(color).toBe('#d1d5db'); // gray
            }
          }
        ),
        { numRuns: 100 }
      );
    });
    // **Validates: Requirements 4.4**
  });

  // Property 8: Daily Chart Structure
  // Exactly 7 days in Mon-Sun order
  describe('Property 8: Daily Chart Structure', () => {
    it('daily chart always has exactly 7 items in Mon-Sun order', () => {
      const validDateArb = fc.integer({ min: 1577836800000, max: 1798761600000 })
        .map(ts => new Date(ts).toISOString());
      
      const planArb = fc.record({
        id: fc.uuid(),
        department_code: fc.constantFrom('BAS', 'HR'),
        updated_at: validDateArb,
      });

      fc.assert(
        fc.property(
          fc.array(planArb, { minLength: 0, maxLength: 50 }),
          (plans) => {
            const grouped = groupByDayOfWeek(plans);
            
            // Always 7 items
            expect(grouped.length).toBe(7);
            
            // Correct order
            const expectedOrder = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            grouped.forEach((item, index) => {
              expect(item.name).toBe(expectedOrder[index]);
            });
          }
        ),
        { numRuns: 100 }
      );
    });
    // **Validates: Requirements 5.3, 5.4**
  });
});
