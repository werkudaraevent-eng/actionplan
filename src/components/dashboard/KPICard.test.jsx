import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import * as fc from 'fast-check';
import KPICard from './KPICard';
import { Activity } from 'lucide-react';

/**
 * Feature: stats-grid-date-context
 * Property-based tests for KPICard badge rendering
 * 
 * Tests validate that the badge prop correctly controls badge visibility
 * and content in the KPICard component.
 */

describe('KPICard Badge Rendering - Property Tests', () => {
  
  // Default props for KPICard (required props)
  const defaultProps = {
    gradient: 'from-blue-500 to-blue-600',
    icon: Activity,
    value: '100',
    label: 'Test Label',
  };

  // Ensure cleanup after each test
  afterEach(() => {
    cleanup();
  });

  /**
   * Property 1: Badge Renders with Exact Text
   * 
   * For any non-empty string passed as the `badge` prop to KPICard,
   * the component SHALL render a badge element containing that exact text string.
   * 
   * **Validates: Requirements 1.2, 1.4, 2.1, 2.4**
   */
  describe('Property 1: Badge Renders with Exact Text', () => {
    it('renders badge with exact text for any non-empty string', () => {
      // Generate non-empty alphanumeric strings that are valid badge text
      // Use alphanumeric to avoid special characters that might cause issues
      const nonEmptyStringArb = fc.stringMatching(/^[A-Za-z0-9][A-Za-z0-9 \-()]{0,29}$/)
        .filter(s => s.trim().length > 0);

      fc.assert(
        fc.property(
          nonEmptyStringArb,
          (badgeText) => {
            cleanup(); // Ensure clean state before each iteration
            
            const { container } = render(
              <KPICard {...defaultProps} badge={badgeText} />
            );
            
            // Find badge by its specific class combination
            const badge = container.querySelector('span.absolute.top-2.right-2.bg-white\\/20.rounded-full');
            expect(badge).not.toBeNull();
            expect(badge.textContent).toBe(badgeText);
            
            // Verify it has the badge styling classes
            expect(badge).toHaveClass('bg-white/20');
            expect(badge).toHaveClass('rounded-full');
            expect(badge).toHaveClass('text-white/90');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('renders badge with common date context values', () => {
      // Test with realistic date context values
      const dateContextArb = fc.constantFrom(
        'YTD',
        'Filtered',
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
        'Jan - Mar',
        'Apr - Jun',
        'Jul - Sep',
        'Oct - Dec',
        'Jan - Dec',
        'YTD (Jan - Current)',
        'Q1',
        'Q2',
        'Q3',
        'Q4',
        '2024',
        '2025',
        '2026'
      );

      fc.assert(
        fc.property(
          dateContextArb,
          (badgeText) => {
            cleanup(); // Ensure clean state before each iteration
            
            const { container } = render(
              <KPICard {...defaultProps} badge={badgeText} />
            );
            
            // Find badge by its specific class combination
            const badge = container.querySelector('span.absolute.top-2.right-2.bg-white\\/20.rounded-full');
            expect(badge).not.toBeNull();
            expect(badge.textContent).toBe(badgeText);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('badge text is preserved exactly without modification', () => {
      // Test that special characters and formatting are preserved
      // Use specific known values to ensure exact matching
      const specialTextArb = fc.constantFrom(
        'Jan - Mar',
        'YTD (Jan - Current)',
        'Q1 2025',
        'Week 1-4',
        '2024/2025',
        'ABC-123',
        'Test Badge',
        'A1 B2 C3',
        'Jan-Dec 2025',
        'Q1-Q4'
      );

      fc.assert(
        fc.property(
          specialTextArb,
          (badgeText) => {
            cleanup(); // Ensure clean state before each iteration
            
            const { container } = render(
              <KPICard {...defaultProps} badge={badgeText} />
            );
            
            // Find badge by its specific class combination
            const badge = container.querySelector('span.absolute.top-2.right-2.bg-white\\/20.rounded-full');
            expect(badge).not.toBeNull();
            expect(badge.textContent).toBe(badgeText);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 2: No Badge When Empty or Undefined
   * 
   * For any KPICard rendered with `badge` prop that is undefined, null,
   * or empty string, the component SHALL NOT render any badge element in the DOM.
   * 
   * **Validates: Requirements 2.6**
   */
  describe('Property 2: No Badge When Empty or Undefined', () => {
    it('does not render badge when prop is undefined', () => {
      fc.assert(
        fc.property(
          fc.constant(undefined),
          () => {
            cleanup(); // Ensure clean state before each iteration
            
            const { container } = render(
              <KPICard {...defaultProps} badge={undefined} />
            );
            
            // No badge element should exist - check for the specific badge selector
            const badge = container.querySelector('span.absolute.top-2.right-2.bg-white\\/20.rounded-full.text-white\\/90');
            expect(badge).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('does not render badge when prop is null', () => {
      fc.assert(
        fc.property(
          fc.constant(null),
          () => {
            cleanup(); // Ensure clean state before each iteration
            
            const { container } = render(
              <KPICard {...defaultProps} badge={null} />
            );
            
            // No badge element should exist
            const badge = container.querySelector('span.absolute.top-2.right-2.bg-white\\/20.rounded-full.text-white\\/90');
            expect(badge).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('does not render badge when prop is empty string', () => {
      fc.assert(
        fc.property(
          fc.constant(''),
          () => {
            cleanup(); // Ensure clean state before each iteration
            
            const { container } = render(
              <KPICard {...defaultProps} badge="" />
            );
            
            // No badge element should exist
            const badge = container.querySelector('span.absolute.top-2.right-2.bg-white\\/20.rounded-full.text-white\\/90');
            expect(badge).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('does not render badge for any falsy or empty value', () => {
      // Generate various falsy/empty values
      const falsyValueArb = fc.constantFrom(
        undefined,
        null,
        '',
        false,
        0
      );

      fc.assert(
        fc.property(
          falsyValueArb,
          (badgeValue) => {
            cleanup(); // Ensure clean state before each iteration
            
            const { container } = render(
              <KPICard {...defaultProps} badge={badgeValue} />
            );
            
            // No badge element should exist
            const badge = container.querySelector('span.absolute.top-2.right-2.bg-white\\/20.rounded-full.text-white\\/90');
            expect(badge).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('badge prop omission results in no badge element', () => {
      fc.assert(
        fc.property(
          fc.constant(true), // Just need to run the test
          () => {
            cleanup(); // Ensure clean state before each iteration
            
            // Render without badge prop at all
            const { container } = render(
              <KPICard 
                gradient={defaultProps.gradient}
                icon={defaultProps.icon}
                value={defaultProps.value}
                label={defaultProps.label}
              />
            );
            
            // No badge element should exist
            const badge = container.querySelector('span.absolute.top-2.right-2.bg-white\\/20.rounded-full.text-white\\/90');
            expect(badge).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Additional unit tests for specific badge behavior
   */
  describe('Badge Styling and Positioning', () => {
    it('badge has correct CSS classes for styling', () => {
      render(<KPICard {...defaultProps} badge="YTD" />);
      
      const badge = screen.getByText('YTD');
      
      // Verify all expected styling classes
      expect(badge).toHaveClass('absolute');
      expect(badge).toHaveClass('top-2');
      expect(badge).toHaveClass('right-2');
      expect(badge).toHaveClass('text-[10px]');
      expect(badge).toHaveClass('font-medium');
      expect(badge).toHaveClass('bg-white/20');
      expect(badge).toHaveClass('px-2');
      expect(badge).toHaveClass('py-0.5');
      expect(badge).toHaveClass('rounded-full');
      expect(badge).toHaveClass('text-white/90');
    });

    it('badge is positioned in top-right corner', () => {
      render(<KPICard {...defaultProps} badge="Filtered" />);
      
      const badge = screen.getByText('Filtered');
      
      // Verify positioning classes
      expect(badge).toHaveClass('absolute');
      expect(badge).toHaveClass('top-2');
      expect(badge).toHaveClass('right-2');
    });

    it('badge does not interfere with other card content', () => {
      render(
        <KPICard 
          {...defaultProps} 
          badge="YTD"
          tooltipContent={<span>Tooltip content</span>}
        />
      );
      
      // Badge should be present
      expect(screen.getByText('YTD')).toBeInTheDocument();
      
      // Value and label should still be present
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('Test Label')).toBeInTheDocument();
    });
  });
});
