import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import CompletionRequirementsHint from './CompletionRequirementsHint';

describe('CompletionRequirementsHint', () => {
  afterEach(cleanup);

  it('says nothing while the plan is still in progress', () => {
    for (const status of ['Open', 'On Progress', 'Blocked', undefined, null, '']) {
      const { container } = render(<CompletionRequirementsHint status={status} />);
      expect(container, `rendered for ${status}`).toBeEmptyDOMElement();
      cleanup();
    }
  });

  it('asks an Achieved plan for evidence that someone else can open', () => {
    render(<CompletionRequirementsHint status="Achieved" />);

    expect(screen.getByText(/Menandai Achieved/)).toBeInTheDocument();
    expect(screen.getByText(/Minimal satu bukti/)).toBeInTheDocument();
    expect(screen.getByText(/bisa dibuka orang lain/)).toBeInTheDocument();
  });

  it('tells an Achieved plan it is heading for grading', () => {
    render(<CompletionRequirementsHint status="Achieved" />);
    expect(screen.getByText(/masuk antrean penilaian/)).toBeInTheDocument();
  });

  it('asks a Not Achieved plan for the cause as well as evidence', () => {
    render(<CompletionRequirementsHint status="Not Achieved" />);

    expect(screen.getByText(/Menandai Not Achieved/)).toBeInTheDocument();
    expect(screen.getByText(/Minimal satu bukti/)).toBeInTheDocument();
    expect(screen.getByText(/Kategori penyebab/)).toBeInTheDocument();
  });

  it('warns that Not Achieved scores zero and steers unfinished work elsewhere', () => {
    // The consequence nobody was told: it is scored automatically and never reaches a
    // grader, so choosing it for work that is merely late throws the score away.
    render(<CompletionRequirementsHint status="Not Achieved" />);

    const note = screen.getByText(/otomatis dinilai 0/);
    expect(note).toBeInTheDocument();
    expect(note).toHaveTextContent(/tidak masuk antrean penilaian/);
    expect(note).toHaveTextContent(/pilih On Progress/);
  });

  it('does not promise grading to a plan that will never be graded', () => {
    render(<CompletionRequirementsHint status="Not Achieved" />);
    expect(screen.queryByText(/^Setelah bulan ditutup, rencana ini masuk antrean/)).not.toBeInTheDocument();
  });
});
