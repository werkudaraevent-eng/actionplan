import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import GlobalStatsGrid from './GlobalStatsGrid';

/**
 * Feature: stats-grid-date-context
 * Property-based tests for GlobalStatsGrid badge logic
 * 
 * Tests validate that the GlobalStatsGrid component correctly:
 * - Falls back to periodLabel when dateContext is empty (Property 3)
 * - Shows badges on primary cards (Property 4)
 * - Respects showBadgeOnStatusCards flag for status cards (Property 5)
 * 
 * **Validates: Requirements 1.3, 3.1, 3.2, 3.4, 3.5**
 */

// Helper to find badge on a specific card by its label text
function findBadgeOnCard(container, labelText) {
  const cards = container.querySelectorAll('[class*="from-"]');
  for (const card of cards) {
    if (card.textContent.includes(labelText)) {
      const badge = card.querySelector('span.absolute.top-2.right-2.bg-white\\/20.rounded-full.text-white\\/90');
      return badge;
    }
  }
  return null;
}

function cardHasBadge(container, labelText) {
  return findBadgeOnCard(container, labelText) !== null;
}

function getBadgeTextOnCard(container, labelText) {
  const badge = findBadgeOnCard(container, labelText);
  return badge ? badge.textContent : null;
}

// Primary card labels (always show badges when dateContext/periodLabel is provided)
const PRIMARY_CARD_LABELS = ['Completion Rate', 'Verification Score', 'Total Plans'];

// Status card labels (conditionally show badges based on showBadgeOnStatusCards)
const STATUS_CARD_LABELS = ['Achieved', 'In Progress', 'Not Achieved'];

describe('GlobalStatsGrid Badge Logic - Property Tests', () => {
  afterEach(() => {
    cleanup();
  });


  /**
   * Feature: stats-grid-date-context, Property 3: Date Context Fallback to PeriodLabel
   * 
   * For any GlobalStatsGrid where `dateContext` is empty/undefined and `periodLabel` 
   * is a non-empty string, the badge text SHALL be derived from `periodLabel` with 
   * leading/trailing parentheses and whitespace stripped.
   * 
   * **Validates: Requirements 1.3**
   */
  describe('Property 3: Date Context Fallback to PeriodLabel', () => {
    it('falls back to periodLabel when dateContext is empty', () => {
      const periodLabelArb = fc.constantFrom(
        '(YTD)', '(Jan - Mar)', '(Filtered)', '(Q1)', '(2025)'
      );
      fc.assert(
        fc.property(periodLabelArb, (periodLabel) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext="" periodLabel={periodLabel} />
          );
          const expectedBadgeText = periodLabel.trim().replace(/^\(|\)$/g, '');
          const completionBadge = getBadgeTextOnCard(container, 'Completion Rate');
          expect(completionBadge).toBe(expectedBadgeText);
        }),
        { numRuns: 100 }
      );
    });

    it('falls back to periodLabel when dateContext is undefined', () => {
      const periodLabelArb = fc.constantFrom(
        '(YTD)', '(Jan - Mar)', '(Filtered)', '(March)', '(Q2 2025)'
      );
      fc.assert(
        fc.property(periodLabelArb, (periodLabel) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} periodLabel={periodLabel} />
          );
          const expectedBadgeText = periodLabel.trim().replace(/^\(|\)$/g, '');
          const totalPlansBadge = getBadgeTextOnCard(container, 'Total Plans');
          expect(totalPlansBadge).toBe(expectedBadgeText);
        }),
        { numRuns: 100 }
      );
    });

    it('strips leading/trailing parentheses correctly from periodLabel', () => {
      const testCases = fc.constantFrom(
        { input: '(YTD)', expected: 'YTD' },
        { input: '(Jan - Mar)', expected: 'Jan - Mar' },
        { input: ' (Filtered) ', expected: 'Filtered' },
        { input: '(Q1)', expected: 'Q1' },
        { input: '((nested))', expected: '(nested)' },
        { input: 'No Parens', expected: 'No Parens' },
        { input: '(Start Only', expected: '(Start Only' },
        { input: 'End Only)', expected: 'End Only)' }
      );
      fc.assert(
        fc.property(testCases, (testCase) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext="" periodLabel={testCase.input} />
          );
          const verificationBadge = getBadgeTextOnCard(container, 'Verification Score');
          expect(verificationBadge).toBe(testCase.expected);
        }),
        { numRuns: 100 }
      );
    });

    it('prefers dateContext over periodLabel when both are provided', () => {
      const dateContextArb = fc.constantFrom('YTD', 'Filtered', 'Jan - Mar', 'Q1');
      const periodLabelArb = fc.constantFrom('(Different)', '(Other)', '(Fallback)');
      fc.assert(
        fc.property(dateContextArb, periodLabelArb, (dateContext, periodLabel) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} periodLabel={periodLabel} />
          );
          const completionBadge = getBadgeTextOnCard(container, 'Completion Rate');
          expect(completionBadge).toBe(dateContext);
        }),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Feature: stats-grid-date-context, Property 4: Primary Cards Always Show Badge
   * 
   * For any GlobalStatsGrid with non-empty `dateContext` (or non-empty `periodLabel` 
   * as fallback), the Total Plans, Completion Rate, and Verification Score cards 
   * SHALL each display a badge with the context text.
   * 
   * **Validates: Requirements 3.1, 3.2**
   */
  describe('Property 4: Primary Cards Always Show Badge', () => {
    it('all primary cards show badge when dateContext is provided', () => {
      const dateContextArb = fc.constantFrom(
        'YTD', 'Filtered', 'Jan', 'Feb', 'Mar', 'Jan - Mar', 'Apr - Jun', 'Q1', 'Q2', '2025'
      );
      fc.assert(
        fc.property(dateContextArb, (dateContext) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} />
          );
          for (const label of PRIMARY_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
            expect(getBadgeTextOnCard(container, label)).toBe(dateContext);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('all primary cards show badge when periodLabel is provided (fallback)', () => {
      const periodLabelArb = fc.constantFrom('(YTD)', '(Filtered)', '(Jan - Mar)', '(Q1 2025)');
      fc.assert(
        fc.property(periodLabelArb, (periodLabel) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} periodLabel={periodLabel} />
          );
          const expectedBadgeText = periodLabel.trim().replace(/^\(|\)$/g, '');
          for (const label of PRIMARY_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
            expect(getBadgeTextOnCard(container, label)).toBe(expectedBadgeText);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('primary cards show no badge when both dateContext and periodLabel are empty', () => {
      const emptyContextArb = fc.constantFrom(
        { dateContext: '', periodLabel: '' },
        { dateContext: undefined, periodLabel: '' },
        { dateContext: '', periodLabel: undefined },
        { dateContext: undefined, periodLabel: undefined }
      );
      fc.assert(
        fc.property(emptyContextArb, (ctx) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={ctx.dateContext} periodLabel={ctx.periodLabel} />
          );
          for (const label of PRIMARY_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('primary cards show badge regardless of plans data', () => {
      const plansArb = fc.constantFrom(
        [],
        [{ id: '1', status: 'Achieved', month: 'Jan' }],
        [
          { id: '1', status: 'Achieved', month: 'Jan' },
          { id: '2', status: 'On Progress', month: 'Feb' },
          { id: '3', status: 'Not Achieved', month: 'Mar' }
        ]
      );
      const dateContextArb = fc.constantFrom('YTD', 'Filtered', 'Jan - Mar');
      fc.assert(
        fc.property(plansArb, dateContextArb, (plans, dateContext) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={plans} dateContext={dateContext} />
          );
          for (const label of PRIMARY_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Feature: stats-grid-date-context, Property 5: Status Cards Respect showBadgeOnStatusCards Flag
   * 
   * For any GlobalStatsGrid with `showBadgeOnStatusCards=false` (or undefined), 
   * the Achieved, In Progress, and Not Achieved cards SHALL NOT display badges, 
   * regardless of `dateContext` value.
   * 
   * For any GlobalStatsGrid with `showBadgeOnStatusCards=true` and non-empty 
   * `dateContext`, the Achieved, In Progress, and Not Achieved cards SHALL display badges.
   * 
   * **Validates: Requirements 3.4, 3.5**
   */
  describe('Property 5: Status Cards Respect showBadgeOnStatusCards Flag', () => {
    it('status cards do NOT show badges when showBadgeOnStatusCards is false', () => {
      const dateContextArb = fc.constantFrom('YTD', 'Filtered', 'Jan - Mar', 'Q1', '2025');
      fc.assert(
        fc.property(dateContextArb, (dateContext) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} showBadgeOnStatusCards={false} />
          );
          for (const label of STATUS_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(false);
          }
          for (const label of PRIMARY_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('status cards do NOT show badges when showBadgeOnStatusCards is undefined (default)', () => {
      const dateContextArb = fc.constantFrom('YTD', 'Filtered', 'Jan - Mar');
      fc.assert(
        fc.property(dateContextArb, (dateContext) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} />
          );
          for (const label of STATUS_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('status cards show badges when showBadgeOnStatusCards is true and dateContext is non-empty', () => {
      const dateContextArb = fc.constantFrom('YTD', 'Filtered', 'Jan - Mar', 'Q1', '2025');
      fc.assert(
        fc.property(dateContextArb, (dateContext) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} showBadgeOnStatusCards={true} />
          );
          for (const label of STATUS_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
            expect(getBadgeTextOnCard(container, label)).toBe(dateContext);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('status cards do NOT show badges when showBadgeOnStatusCards is true but dateContext is empty', () => {
      const emptyContextArb = fc.constantFrom('', undefined);
      fc.assert(
        fc.property(emptyContextArb, (dateContext) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} periodLabel="" showBadgeOnStatusCards={true} />
          );
          for (const label of STATUS_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('status cards show badges with periodLabel fallback when showBadgeOnStatusCards is true', () => {
      const periodLabelArb = fc.constantFrom('(YTD)', '(Filtered)', '(Jan - Mar)');
      fc.assert(
        fc.property(periodLabelArb, (periodLabel) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} periodLabel={periodLabel} showBadgeOnStatusCards={true} />
          );
          const expectedBadgeText = periodLabel.trim().replace(/^\(|\)$/g, '');
          for (const label of STATUS_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
            expect(getBadgeTextOnCard(container, label)).toBe(expectedBadgeText);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('showBadgeOnStatusCards flag does not affect primary cards', () => {
      const showBadgeArb = fc.boolean();
      const dateContextArb = fc.constantFrom('YTD', 'Filtered', 'Jan - Mar');
      fc.assert(
        fc.property(showBadgeArb, dateContextArb, (showBadgeOnStatusCards, dateContext) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} showBadgeOnStatusCards={showBadgeOnStatusCards} />
          );
          for (const label of PRIMARY_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });
  });
});
