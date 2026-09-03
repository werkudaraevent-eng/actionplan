import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import DivisionBreakdownWidget from './DivisionBreakdownWidget';
import { summarizeByDivision } from '../../utils/divisionManagementUtils';

// recharts measures its container, which jsdom reports as 0x0, so the bars never paint
// here. The table and the captions below it carry the same figures and do render, and
// those are what a reader actually reconciles against the KPI cards.
const DIVISIONS = [
  { id: 'comms', code: 'COMMS', name: 'Commercials' },
  { id: 'cmc', code: 'CMC', name: 'Corporate Marketing Communication' },
  { id: 'bs', code: 'BS', name: 'Business Solutions' },
];

const rowFor = (code, rows) => rows.find((row) => row.code === code);

describe('DivisionBreakdownWidget', () => {
  afterEach(cleanup);

  it('tells the reader divisions are not set up rather than rendering an empty chart', () => {
    render(<DivisionBreakdownWidget rows={[]} periodLabel="Jan - Dec 2026" />);
    expect(screen.getByText(/No divisions defined for this department yet/i)).toBeInTheDocument();
  });

  it('lists every division, including one that filed nothing', () => {
    const rows = summarizeByDivision([{ division_id: 'comms', status: 'Open' }], DIVISIONS);
    render(<DivisionBreakdownWidget rows={rows} periodLabel="Jan - Dec 2026" />);

    for (const code of ['COMMS', 'CMC', 'BS']) {
      expect(screen.getByText(code)).toBeInTheDocument();
    }
    expect(screen.getByText(/filed no plans in this period/i)).toHaveTextContent('CMC, BS');
  });

  it('warns that ungraded Achieved plans are excluded from completion', () => {
    const rows = summarizeByDivision(
      [
        { division_id: 'comms', status: 'Achieved', quality_score: null },
        { division_id: 'comms', status: 'Achieved', quality_score: 90 },
      ],
      DIVISIONS
    );
    render(<DivisionBreakdownWidget rows={rows} periodLabel="Jan - Dec 2026" />);
    expect(screen.getByText(/1 plan marked Achieved but not yet graded/i)).toBeInTheDocument();
  });

  it('stays silent about grading when every Achieved plan has a score', () => {
    const rows = summarizeByDivision([{ division_id: 'comms', status: 'Achieved', quality_score: 90 }], DIVISIONS);
    render(<DivisionBreakdownWidget rows={rows} periodLabel="Jan - Dec 2026" />);
    expect(screen.queryByText(/not yet graded/i)).not.toBeInTheDocument();
  });

  it('drills into the division whose row is clicked', () => {
    const onDivisionClick = vi.fn();
    const rows = summarizeByDivision([{ division_id: 'cmc', status: 'Open' }], DIVISIONS);
    render(<DivisionBreakdownWidget rows={rows} periodLabel="Jan - Dec 2026" onDivisionClick={onDivisionClick} />);

    fireEvent.click(screen.getByText('CMC').closest('tr'));
    expect(onDivisionClick).toHaveBeenCalledWith('cmc');
  });

  it('passes null for the department-level row so the caller can select unassigned plans', () => {
    const onDivisionClick = vi.fn();
    const rows = summarizeByDivision([{ division_id: null, status: 'Open' }], DIVISIONS);
    render(<DivisionBreakdownWidget rows={rows} periodLabel="Jan - Dec 2026" onDivisionClick={onDivisionClick} />);

    fireEvent.click(screen.getByText('Department level').closest('tr'));
    expect(onDivisionClick).toHaveBeenCalledWith(null);
  });

  it('is not clickable when no drill-down handler is given', () => {
    const rows = summarizeByDivision([{ division_id: 'cmc', status: 'Open' }], DIVISIONS);
    render(<DivisionBreakdownWidget rows={rows} periodLabel="Jan - Dec 2026" />);
    expect(screen.getByText('CMC').closest('tr').className).not.toMatch(/cursor-pointer/);
  });

  it('reports a division with no scored plans as a dash, not as zero', () => {
    const rows = summarizeByDivision([{ division_id: 'bs', status: 'Open' }], DIVISIONS);
    expect(rowFor('BS', rows).avgScore).toBeNull();

    render(<DivisionBreakdownWidget rows={rows} periodLabel="Jan - Dec 2026" />);
    const bsRow = screen.getByText('BS').closest('tr');
    // Plans, Verified, Awaiting grade, Open, Score
    expect([...bsRow.querySelectorAll('td')].map((cell) => cell.textContent.trim()))
      .toEqual(['BSBusiness Solutions', '1', '0', '—', '1', '—']);
  });
});
