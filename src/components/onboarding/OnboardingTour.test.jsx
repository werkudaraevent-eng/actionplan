import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import OnboardingTour from './OnboardingTour';
import { getOnboardingSteps, ONBOARDING_VERSION } from './onboardingSteps';

// jsdom gives every element a zero-sized rect, and the tour drops steps whose target
// measures zero — it cannot point at something with no position. Real dimensions are
// stubbed so the filtering under test is "is the element there", not "does jsdom lay out".
function anchor(name) {
  const el = document.createElement('div');
  el.setAttribute('data-tour', name);
  el.getBoundingClientRect = () => ({ top: 100, left: 40, width: 200, height: 48, bottom: 148, right: 240 });
  el.scrollIntoView = vi.fn();
  document.body.appendChild(el);
  return el;
}

const STEPS = [
  { target: null, title: 'Selamat datang', body: 'Pembuka' },
  { target: 'present-one', title: 'Langkah satu', body: 'Ada' },
  { target: 'absent', title: 'Langkah hilang', body: 'Tidak ada di halaman ini' },
  { target: 'present-two', title: 'Langkah dua', body: 'Ada juga' },
];

describe('OnboardingTour', () => {
  beforeEach(() => {
    window.innerWidth = 1280;
    window.innerHeight = 800;
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('drops steps whose target is not on the page', () => {
    anchor('present-one');
    anchor('present-two');
    render(<OnboardingTour steps={STEPS} onFinish={vi.fn()} onSkip={vi.fn()} />);

    // Intro + two present targets; the absent one never gets a number.
    expect(screen.getByText('Langkah 1 dari 3')).toBeInTheDocument();
    expect(screen.queryByText('Langkah hilang')).not.toBeInTheDocument();
  });

  it('renders nothing rather than an empty overlay when no step can be shown', () => {
    const { container } = render(
      <OnboardingTour steps={[{ target: 'absent', title: 'x', body: 'y' }]} onFinish={vi.fn()} onSkip={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('walks forward and back without renumbering', () => {
    anchor('present-one');
    anchor('present-two');
    render(<OnboardingTour steps={STEPS} onFinish={vi.fn()} onSkip={vi.fn()} />);

    expect(screen.getByText('Selamat datang')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Lanjut/i }));
    expect(screen.getByText('Langkah satu')).toBeInTheDocument();
    expect(screen.getByText('Langkah 2 dari 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Kembali/i }));
    expect(screen.getByText('Selamat datang')).toBeInTheDocument();
  });

  it('offers Selesai only on the last step, and reports finishing', () => {
    anchor('present-one');
    anchor('present-two');
    const onFinish = vi.fn();
    render(<OnboardingTour steps={STEPS} onFinish={onFinish} onSkip={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Lanjut/i }));
    fireEvent.click(screen.getByRole('button', { name: /Lanjut/i }));
    expect(screen.queryByRole('button', { name: /Lanjut/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Selesai/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed from the close button and from Escape', () => {
    anchor('present-one');
    anchor('present-two');
    const onSkip = vi.fn();
    render(<OnboardingTour steps={STEPS} onFinish={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(screen.getByRole('button', { name: /Lewati panduan/i }));
    expect(onSkip).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onSkip).toHaveBeenCalledTimes(2);
  });

  it('has no back button on the first step', () => {
    anchor('present-one');
    render(<OnboardingTour steps={STEPS} onFinish={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Kembali/i })).not.toBeInTheDocument();
  });
});

describe('onboarding steps', () => {
  it('gives each role a tour that ends where it can be replayed', () => {
    for (const role of ['staff', 'leader', 'admin']) {
      const steps = getOnboardingSteps(role);
      expect(steps.length, `${role} tour is empty`).toBeGreaterThan(2);
      expect(steps[steps.length - 1].target, `${role} tour does not end at the profile menu`)
        .toBe('profile-menu');
    }
  });

  it('treats an unknown role as staff rather than showing nothing', () => {
    expect(getOnboardingSteps(undefined)).toEqual(getOnboardingSteps('staff'));
    expect(getOnboardingSteps('something_new')).toEqual(getOnboardingSteps('staff'));
  });

  it('routes elevated roles to the tour that matches their access', () => {
    expect(getOnboardingSteps('holding_admin')).toEqual(getOnboardingSteps('admin'));
    expect(getOnboardingSteps('dept_head')).toEqual(getOnboardingSteps('leader'));
  });

  it('names every target it points at, so a typo cannot pass silently', () => {
    const KNOWN = new Set([
      'nav-dashboard', 'nav-plans', 'nav-workspace', 'nav-action-center',
      'nav-users', 'nav-settings', 'plans-table', 'readiness-panel', 'profile-menu',
    ]);
    for (const role of ['staff', 'leader', 'admin']) {
      for (const step of getOnboardingSteps(role)) {
        if (step.target) expect(KNOWN, `unknown target ${step.target}`).toContain(step.target);
      }
    }
  });

  it('carries a version so a reworked tour can be offered again', () => {
    expect(ONBOARDING_VERSION).toBeGreaterThan(0);
  });
});
