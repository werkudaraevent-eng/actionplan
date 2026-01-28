import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import GlobalStatsGrid from './GlobalStatsGrid';

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

const PRIMARY_CARD_LABELS = ['Completion Rate', 'Verification Score', 'Total Plans'];
const STATUS_CARD_LABELS = ['Achieved', 'In Progress', 'Not Achieved'];

describe('GlobalStatsGrid Badge Logic - Property Tests', () => {
  afterEach(() => {
    cleanup();
  });

  describe('Property 3: Date Context Fallback to PeriodLabel', () => {
    it('falls back to periodLabel when dateContext is empty', () => {
      const periodLabelArb = fc.constantFrom('(YTD)', '(Jan - Mar)', '(Filtered)');
      fc.assert(
        fc.property(periodLabelArb, (periodLabel) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext="" periodLabel={periodLabel} />
          );
          const expectedBadgeText = periodLabel.trim().replace(/^\(|\)$/g, '');
          expect(getBadgeTextOnCard(container, 'Completion Rate')).toBe(expectedBadgeText);
        }),
        { numRuns: 100 }
      );
    });

    it('falls back to periodLabel when dateContext is undefined', () => {
      const periodLabelArb = fc.constantFrom('(YTD)', '(Jan - Mar)', '(Filtered)');
      fc.assert(
        fc.property(periodLabelArb, (periodLabel) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} periodLabel={periodLabel} />
          );
          const expectedBadgeText = periodLabel.trim().replace(/^\(|\)$/g, '');
          expect(getBadgeTextOnCard(container, 'Total Plans')).toBe(expectedBadgeText);
        }),
        { numRuns: 100 }
      );
    });

    it('prefers dateContext over periodLabel when both are provided', () => {
      const dateContextArb = fc.constantFrom('YTD', 'Filtered', 'Jan - Mar');
      const periodLabelArb = fc.constantFrom('(Different)', '(Other)');
      fc.assert(
        fc.property(dateContextArb, periodLabelArb, (dateContext, periodLabel) => {
          cleanup();
          const { container } = render(
            <GlobalStatsGrid plans={[]} dateContext={dateContext} periodLabel={periodLabel} />
          );
          expect(getBadgeTextOnCard(container, 'Completion Rate')).toBe(dateContext);
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: Primary Cards Always Show Badge', () => {
    it('all primary cards show badge when dateContext is provided', () => {
      const dateContextArb = fc.constantFrom('YTD', 'Filtered', 'Jan - Mar', 'Q1', '2025');
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

    it('primary cards show no badge when both dateContext and periodLabel are empty', () => {
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
          for (const label of PRIMARY_CARD_LABELS) {
            expect(cardHasBadge(container, label)).toBe(false);
          }
        }),
        { numRuns: 100 }
      );
    });
  });

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
          for (const label of PRIMARY_CARD_LABELS) {
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
      const dateContextArb = fc.constantFrom('YTD', 'Filtered', 'Jan - Mar');
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