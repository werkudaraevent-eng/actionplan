import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CodeChip, PhraseChip } from './TableChip';

const LONG = 'End to End Business Process Implementation';

describe('table chips', () => {
  afterEach(cleanup);

  it('keeps a code on one line, which is what makes the pill safe', () => {
    render(<CodeChip className="bg-indigo-50">COMMS</CodeChip>);
    const chip = screen.getByText('COMMS');

    expect(chip.className).toContain('rounded-full');
    expect(chip.className).toContain('whitespace-nowrap');
  });

  it('never gives a wrapping phrase a pill', () => {
    // rounded-full resolves to half the height, so on three wrapped lines the corner arc
    // reaches ~30px while the padding stops at 10px and cuts through the text.
    render(<PhraseChip className="bg-blue-50">{LONG}</PhraseChip>);
    const chip = screen.getByText(LONG);

    expect(chip.className).not.toContain('rounded-full');
    expect(chip.className).toContain('rounded-md');
  });

  it('leaves a phrase free to wrap rather than forcing one line', () => {
    render(<PhraseChip>{LONG}</PhraseChip>);
    expect(screen.getByText(LONG).className).not.toContain('whitespace-nowrap');
  });

  it('gives wrapped lines room to breathe', () => {
    render(<PhraseChip>{LONG}</PhraseChip>);
    expect(screen.getByText(LONG).className).toContain('leading-relaxed');
  });

  it('pads both shapes wider than the radius they carry', () => {
    // The invariant the whole file exists to hold: padding must clear the corner.
    render(<><CodeChip>A</CodeChip><PhraseChip>B</PhraseChip></>);
    expect(screen.getByText('A').className).toContain('px-2.5');
    expect(screen.getByText('B').className).toContain('px-2.5');
  });

  it('lets the caller bring the colour without touching the shape', () => {
    render(<CodeChip className="bg-red-50 text-red-700">UH (Ultra High)</CodeChip>);
    const chip = screen.getByText('UH (Ultra High)');

    expect(chip.className).toContain('bg-red-50');
    expect(chip.className).toContain('rounded-full');
  });
});
