import { afterEach, describe, expect, it } from 'vitest';
import {
  urlSignalsRecovery,
  passwordResetRedirectUrl,
  markRecoveryPending,
  isRecoveryPending,
  clearRecoveryPending,
} from './passwordRecovery';

describe('password recovery landing', () => {
  it('recognises the hash Supabase appends to a reset link', () => {
    expect(urlSignalsRecovery(
      'https://actionplan.werkudara.group/#access_token=abc&expires_in=3600&refresh_token=def&token_type=bearer&type=recovery',
    )).toBe(true);
  });

  it('recognises it on any path, including the site root a misconfigured redirect falls back to', () => {
    expect(urlSignalsRecovery('https://actionplan.werkudara.group/dashboard#type=recovery&access_token=x')).toBe(true);
    expect(urlSignalsRecovery('https://actionplan.werkudara.group/reset-password?type=recovery')).toBe(true);
  });

  it('does not mistake an ordinary login or magic link for a reset', () => {
    expect(urlSignalsRecovery('https://actionplan.werkudara.group/#access_token=abc&type=magiclink')).toBe(false);
    expect(urlSignalsRecovery('https://actionplan.werkudara.group/#access_token=abc&type=signup')).toBe(false);
    expect(urlSignalsRecovery('https://actionplan.werkudara.group/dashboard')).toBe(false);
  });

  it('does not treat an expired-link error as a usable reset', () => {
    expect(urlSignalsRecovery(
      'https://actionplan.werkudara.group/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
    )).toBe(false);
  });

  it('tolerates empty and malformed input', () => {
    expect(urlSignalsRecovery('')).toBe(false);
    expect(urlSignalsRecovery(null)).toBe(false);
    expect(urlSignalsRecovery('not a url')).toBe(false);
  });

  it('points every reset email at the same page', () => {
    expect(passwordResetRedirectUrl('https://actionplan.werkudara.group'))
      .toBe('https://actionplan.werkudara.group/reset-password');
  });
});

describe('recovery flag', () => {
  afterEach(() => clearRecoveryPending());

  it('survives until cleared', () => {
    expect(isRecoveryPending()).toBe(false);
    markRecoveryPending();
    expect(isRecoveryPending()).toBe(true);
    clearRecoveryPending();
    expect(isRecoveryPending()).toBe(false);
  });
});
