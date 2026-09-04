import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

// The sidebar sits on top of routing, three contexts, three hooks and Supabase realtime.
// None of that is what collapsing does, so it is all stubbed and the test is left looking
// only at what the rail is supposed to change.
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => ({ pathname: '/workspace' }),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'u1', full_name: 'Bagus Contoh', role: 'staff' },
    isAdmin: false, isHoldingAdmin: false, isExecutive: false,
    isStaff: true, isLeader: false, departmentCode: 'SM', signOut: vi.fn(),
  }),
}));
vi.mock('../../context/DepartmentContext', () => ({
  useDepartmentContext: () => ({
    currentDept: 'SM', accessibleDepts: [], switchDept: vi.fn(), hasMultipleDepts: false,
  }),
}));
vi.mock('../../context/CompanyContext', () => ({
  useCompanyContext: () => ({
    companies: [], activeCompanyId: 'c1', activeCompany: { name: 'Werkudara' },
    setActiveCompanyId: vi.fn(), canSwitchCompany: false, isHoldingContext: false, isSandbox: false,
  }),
}));
vi.mock('../../hooks/useDepartments', () => ({ useDepartments: () => ({ departments: [], loading: false }) }));
vi.mock('../../hooks/useDivisions', () => ({ useDivisions: () => ({ divisions: [], hierarchyEnabled: false }) }));
vi.mock('../../hooks/usePermission', () => ({ usePermission: () => ({ can: () => false }) }));
vi.mock('../common/Toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('../../lib/supabase', () => ({ supabase: null }));

const { default: Sidebar } = await import('./Sidebar');

describe('Sidebar collapse', () => {
  beforeEach(() => localStorage.clear());
  afterEach(cleanup);

  it('starts wide, with the words showing', () => {
    const { container } = render(<Sidebar />);

    expect(container.firstChild.className).toContain('min-w-64');
    expect(screen.getByText('My Action Plans')).toBeInTheDocument();
    expect(screen.getByText('Werkudara')).toBeInTheDocument();
  });

  it('narrows to a rail and drops the words, keeping the buttons', () => {
    const { container } = render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /Persempit sidebar/i }));

    expect(container.firstChild.className).toContain('min-w-16');
    expect(screen.queryByText('My Action Plans')).not.toBeInTheDocument();
    // The action itself survives — it is reachable by the tooltip that replaced the label.
    expect(screen.getByRole('button', { name: /My Action Plans/i })).toBeInTheDocument();
  });

  it('labels every railed button so an icon alone is never the only clue', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /Persempit sidebar/i }));

    for (const label of ['My Action Plans', 'Team Overview']) {
      expect(document.querySelector(`[title="${label}"]`), `${label} has no tooltip`).toBeTruthy();
    }
  });

  it('hides the company name but keeps its mark', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /Persempit sidebar/i }));

    expect(screen.queryByText('Werkudara')).not.toBeInTheDocument();
    expect(screen.getByText('W')).toBeInTheDocument();
  });

  it('reduces the profile to an avatar, and still opens its menu', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /Persempit sidebar/i }));

    expect(screen.queryByText('Bagus Contoh')).not.toBeInTheDocument();

    // The avatar initials are the button's accessible name once the label is gone, so the
    // tooltip is what has to carry the person's name.
    const profileButton = document.querySelector('[data-tour="profile-menu"]');
    expect(profileButton).toHaveAttribute('title', 'Bagus Contoh');

    fireEvent.click(profileButton);
    expect(screen.getByText('Panduan Penggunaan')).toBeInTheDocument();
  });

  it('goes back to full width', () => {
    const { container } = render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /Persempit sidebar/i }));
    fireEvent.click(screen.getByRole('button', { name: /Perlebar sidebar/i }));

    expect(container.firstChild.className).toContain('min-w-64');
    expect(screen.getByText('My Action Plans')).toBeInTheDocument();
  });

  it('remembers the choice for next time', () => {
    render(<Sidebar />);
    fireEvent.click(screen.getByRole('button', { name: /Persempit sidebar/i }));
    expect(localStorage.getItem('sidebar_collapsed')).toBe('true');

    cleanup();
    const { container } = render(<Sidebar />);
    expect(container.firstChild.className).toContain('min-w-16');
  });

  it('reports its state to assistive technology', () => {
    render(<Sidebar />);
    const toggle = screen.getByRole('button', { name: /Persempit sidebar/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /Perlebar sidebar/i })).toHaveAttribute('aria-expanded', 'false');
  });
});
