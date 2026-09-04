import { describe, expect, it } from 'vitest';
import { USER_GUIDE, getGuideSections, searchGuide } from './userGuide';

describe('user guide', () => {
  it('covers every question the guide exists to answer', () => {
    // The list this was written from. A section disappearing should fail here rather than
    // be noticed by somebody who could not find it.
    for (const id of [
      'status', 'achieved', 'not-achieved', 'evidence',
      'filter', 'close-month', 'dashboard', 'dashboard-settings',
    ]) {
      expect(USER_GUIDE.map((s) => s.id), `missing section ${id}`).toContain(id);
    }
  });

  it('gives every section something to act on', () => {
    for (const section of USER_GUIDE) {
      expect(section.title, `${section.id} has no title`).toBeTruthy();
      expect(section.summary, `${section.id} has no summary`).toBeTruthy();
      expect(
        (section.steps?.length || 0) + (section.table?.rows?.length || 0),
        `${section.id} has neither steps nor a table`
      ).toBeGreaterThan(0);
    }
  });

  it('uses only audiences the filter understands', () => {
    for (const section of USER_GUIDE) {
      expect(['all', 'leader', 'admin'], `${section.id}`).toContain(section.audience);
    }
  });

  it('does not show staff instructions for screens they cannot open', () => {
    const staff = getGuideSections('staff').map((s) => s.id);

    expect(staff).toContain('evidence');
    expect(staff).not.toContain('close-month');
    expect(staff).not.toContain('grading');
    expect(staff).not.toContain('users');
  });

  it('gives a leader month-end but not user administration', () => {
    const leader = getGuideSections('leader').map((s) => s.id);

    expect(leader).toContain('close-month');
    expect(leader).toContain('division-ready');
    expect(leader).not.toContain('users');
  });

  it('gives an admin everything', () => {
    expect(getGuideSections('admin').length).toBe(USER_GUIDE.length);
    expect(getGuideSections('holding_admin').length).toBe(USER_GUIDE.length);
  });

  it('treats an unknown role as staff rather than showing admin work', () => {
    expect(getGuideSections(undefined)).toEqual(getGuideSections('staff'));
    expect(getGuideSections('something_new').map((s) => s.id)).not.toContain('users');
  });

  it('searches the notes and tables, not only the titles', () => {
    const all = getGuideSections('admin');

    // "nilai 0" appears only in a note; "Google Drive" only inside a table row.
    expect(searchGuide(all, 'nilai 0').map((s) => s.id)).toContain('not-achieved');
    expect(searchGuide(all, 'google drive').map((s) => s.id)).toContain('evidence');
  });

  it('ignores case and returns everything for an empty query', () => {
    const all = getGuideSections('admin');

    expect(searchGuide(all, 'TUTUP BULAN').map((s) => s.id)).toContain('close-month');
    expect(searchGuide(all, '   ')).toEqual(all);
    expect(searchGuide(all, '')).toEqual(all);
  });

  it('returns nothing rather than everything when a search misses', () => {
    expect(searchGuide(getGuideSections('admin'), 'zzzznotathing')).toEqual([]);
  });

  it('warns, in the section about it, that Not Achieved is scored zero', () => {
    // The single most consequential fact in the app, and the one nothing used to state.
    const notAchieved = USER_GUIDE.find((s) => s.id === 'not-achieved');
    expect(notAchieved.note).toMatch(/nilai 0/);
    expect(notAchieved.note).toMatch(/masih berjalan/);
  });
});
