import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import GlobalStatsGrid from './GlobalStatsGrid';

function findBadgeOnCard(container, labelText) {
  const cards = container.querySelectorAll('[class*="from-"]');
  for (const card of cards) {
    if (card.textContent.includes(labelText)) {
      // Match both standard (bg-white/20) and YTD amber (bg-amber-500/30) badge styles
      const badge = card.querySelector('span.absolute.top-2.right-2.rounded-full');
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

// Scoring cards always show 'YTD' badge regardless of dateContext/periodLabel
const SCORING_CARD_LABELS = ['Completion Rate', 'Verification Score'];
// Inventory card shows dateContext or periodLabel-derived badge
const INVENTORY_CARD_LABEL = 'Total Plans';
// Status card labels (conditionally show badges based on showBadgeOnStatusCards)
const STATUS_CARD_LABELS = ['Achieved', 'In Progress', 'Not Achieved'];

describe('GlobalStatsGrid Badge Logic - Property Tests', () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * Property 3: Date Context Fallback to PeriodLabel
   * 
   * The Total Plans card uses inventoryBadge = dateContext || periodLabel (stripped).
   * Completion Rate and Verification Score always use scoringBadge = 'YTD'.
   */
  describe('Property 3: Date Context Fallback to PeriodLabel', () => {
    it('Total Plans falls back to periodLabel when dateContext is empty', { timeout: 15000 }, () => {
      const periodLabelArb = fc.constantFrom('(YTD)', '(Jan - Mar)', '(Filtered)');
      fc.assert(
        fc.property(periodLabelArb, (periodLabel) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext="" periodLabel={periodLabel} />
          );
          const expectedBadgeText = periodLabel.trim().replace(/^\(|\)$/g, '');
          expect(getBadgeTextOnCard(container, INVENTORY_CARD_LABEL)).toBe(expectedBadgeText);
        }),
        { numRuns: 100 }
      );
    });

    it('Total Plans falls back to periodLabel when dateContext is undefined', () => {
      const periodLabelArb = fc.constantFrom('(YTD)', '(Jan - Mar)', '(Filtered)');
      fc.assert(
        fc.property(periodLabelArb, (periodLabel) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} periodLabel={periodLabel} />
          );
          const expectedBadgeText = periodLabel.trim().replace(/^\(|\)$/g, '');
          expect(getBadgeTextOnCard(container, INVENTORY_CARD_LABEL)).toBe(expectedBadgeText);
        }),
        { numRuns: 100 }
      );
    });

    it('Total Plans prefers dateContext over periodLabel when both are provided', () => {
      const dateContextArb = fc.constantFrom('FY 2026', 'Filtered', 'Jan - Mar');
      const periodLabelArb = fc.constantFrom('(Different)', '(Other)');
      fc.assert(
        fc.property(dateContextArb, periodLabelArb, (dateContext, periodLabel) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} periodLabel={periodLabel} />
          );
          expect(getBadgeTextOnCard(container, INVENTORY_CARD_LABEL)).toBe(dateContext);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 4: Scoring cards always show 'YTD', inventory card shows context badge
   */
  describe('Property 4: Primary Cards Always Show Badge', () => {
    it('scoring cards always show YTD badge regardless of dateContext', () => {
      const dateContextArb = fc.constantFrom('YTD', 'Filtered', 'Jan - Mar', 'Q1', '2025');
      fc.assert(
        fc.property(dateContextArb, (dateContext) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} />
          );
          // Scoring cards always show 'YTD'
          for (const label of SCORING_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
            expect(getBadgeTextOnCard(container, label)).toBe('YTD');
          }
          // Inventory card shows the dateContext
          expect(cardHasBadge(container, INVENTORY_CARD_LABEL)).toBe(true);
          expect(getBadgeTextOnCard(container, INVENTORY_CARD_LABEL)).toBe(dateContext);
        }),
        { numRuns: 100 }
      );
    });

    it('scoring cards show YTD even when dateContext and periodLabel are empty', () => {
      const emptyContextArb = fc.constantFrom(
        { dateContext: '', periodLabel: '' },
        { dateContext: undefined, periodLabel: '' }
      );
      fc.assert(
        fc.property(emptyContextArb, (ctx) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={ctx.dateContext} periodLabel={ctx.periodLabel} />
          );
          // Scoring cards always show 'YTD' badge
          for (const label of SCORING_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
            expect(getBadgeTextOnCard(container, label)).toBe('YTD');
          }
          // Inventory card has no badge when both are empty
          expect(cardHasBadge(container, INVENTORY_CARD_LABEL)).toBe(false);
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 5: Status Cards Respect showBadgeOnStatusCards Flag
   */
  describe('Property 5: Status Cards Respect showBadgeOnStatusCards Flag', () => {
    it('status cards do NOT show badges when showBadgeOnStatusCards is false', () => {
      const dateContextArb = fc.constantFrom('YTD', 'Filtered', 'Jan - Mar');
      fc.assert(
        fc.property(dateContextArb, (dateContext) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} showBadgeOnStatusCards={false} />
          );
          for (const label of STATUS_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(false);
          }
          // Scoring cards still show badges
          for (const label of SCORING_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('status cards do NOT show badges when showBadgeOnStatusCards is undefined', () => {
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

    it('status cards show badges when showBadgeOnStatusCards is true', () => {
      const dateContextArb = fc.constantFrom('FY 2026', 'Filtered', 'Jan - Mar');
      fc.assert(
        fc.property(dateContextArb, (dateContext) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} showBadgeOnStatusCards={true} />
          );
          for (const label of STATUS_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
            // Status cards use inventoryBadge (dateContext)
            expect(getBadgeTextOnCard(container, label)).toBe(dateContext);
          }
        }),
        { numRuns: 100 }
      );
    });

    it('showBadgeOnStatusCards flag does not affect scoring or inventory cards', () => {
      const showBadgeArb = fc.boolean();
      const dateContextArb = fc.constantFrom('FY 2026', 'Filtered', 'Jan - Mar');
      fc.assert(
        fc.property(showBadgeArb, dateContextArb, (showBadgeOnStatusCards, dateContext) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} showBadgeOnStatusCards={showBadgeOnStatusCards} />
          );
          // Scoring cards always show 'YTD'
          for (const label of SCORING_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(true);
          }
          // Inventory card always shows dateContext
          expect(cardHasBadge(container, INVENTORY_CARD_LABEL)).toBe(true);
        }),
        { numRuns: 100 }
      );
    });
  });
});
