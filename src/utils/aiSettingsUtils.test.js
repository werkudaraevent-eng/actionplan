import { describe, expect, it } from 'vitest';
import { buildAiConfigPayload, buildModelOptions, describeOneDriveItem, inferAiProvider, isMicrosoftClientId, modelsToTest, normalizeAiConfig } from './aiSettingsUtils';

describe('inferAiProvider', () => {
  it('keeps an explicit provider', () => {
    expect(inferAiProvider({ provider: 'anthropic', proxy_url: 'https://tunnel.example.com/v1' })).toBe('anthropic');
    expect(inferAiProvider({ provider: 'openai_compatible', proxy_url: 'https://api.anthropic.com/v1' })).toBe('openai_compatible');
  });

  it('reads settings saved before the picker: an Anthropic URL meant Claude, anything else the proxy', () => {
    expect(inferAiProvider({ proxy_url: 'https://api.anthropic.com/v1' })).toBe('anthropic');
    expect(inferAiProvider({ proxy_url: 'https://my-9router.trycloudflare.com/v1' })).toBe('openai_compatible');
    expect(inferAiProvider({})).toBe('openai_compatible');
    expect(inferAiProvider(null)).toBe('openai_compatible');
  });
});

describe('normalizeAiConfig', () => {
  it('drops the Anthropic URL workaround once the provider is Anthropic', () => {
    const form = normalizeAiConfig({ proxy_url: 'https://api.anthropic.com/v1', model_fast: 'claude-haiku-5-5' });
    expect(form.provider).toBe('anthropic');
    expect(form.proxy_url).toBe('');
    expect(form.model_fast).toBe('claude-haiku-5-5');
  });

  it('fills defaults for a company with no AI settings yet', () => {
    expect(normalizeAiConfig(undefined)).toEqual({
      enabled: true,
      provider: 'openai_compatible',
      proxy_url: '',
      model_fast: '',
      model_reasoning: '',
      timeout_ms: 60000,
      vision: true,
    });
  });
});

describe('buildAiConfigPayload', () => {
  const base = { enabled: true, provider: 'anthropic', proxy_url: '', model_fast: 'claude-haiku-5-5', model_reasoning: '', timeout_ms: '60000', vision: true };

  it('saves the provider and never a proxy URL for Anthropic', () => {
    const { config } = buildAiConfigPayload({ ...base, proxy_url: 'https://leftover.example.com' });
    expect(config).toEqual({
      enabled: true,
      provider: 'anthropic',
      proxy_url: null,
      model_fast: 'claude-haiku-5-5',
      model_reasoning: null,
      timeout_ms: 60000,
      vision: true,
    });
  });

  it('requires a fast model for Anthropic but lets the proxy pick its default', () => {
    expect(buildAiConfigPayload({ ...base, model_fast: '' }).error).toMatch(/Fast Model/);
    const { config } = buildAiConfigPayload({ ...base, provider: 'openai_compatible', model_fast: '', proxy_url: ' https://t.example.com/v1 ' });
    expect(config.model_fast).toBeNull();
    expect(config.proxy_url).toBe('https://t.example.com/v1');
  });

  it('rejects a timeout outside 5s to 300s', () => {
    expect(buildAiConfigPayload({ ...base, timeout_ms: '1000' }).error).toMatch(/Timeout/);
    expect(buildAiConfigPayload({ ...base, timeout_ms: 'abc' }).error).toMatch(/Timeout/);
    expect(buildAiConfigPayload({ ...base, timeout_ms: '300000' }).config.timeout_ms).toBe(300000);
  });
});

describe('buildModelOptions', () => {
  const listed = [
    { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
    { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
  ];

  it('labels models by name and id', () => {
    expect(buildModelOptions(listed).map((o) => o.label)).toEqual([
      'Claude Opus 5.5 (claude-opus-5-5)',
      'Claude Haiku 5.5 (claude-haiku-5-5)',
    ]);
  });

  it('keeps a saved model the list lacks, flagged only when the list really loaded', () => {
    const loaded = buildModelOptions(listed, ['kr/glm-5', 'claude-haiku-5-5', ''], { listLoaded: true });
    expect(loaded[0]).toEqual({ id: 'kr/glm-5', label: "kr/glm-5 (not in the provider's list)", unlisted: true });
    expect(loaded).toHaveLength(3);

    const notLoaded = buildModelOptions([], ['claude-haiku-5-5', 'claude-haiku-5-5'], { listLoaded: false });
    expect(notLoaded).toEqual([{ id: 'claude-haiku-5-5', label: 'claude-haiku-5-5', unlisted: true }]);
  });
});

describe('modelsToTest', () => {
  it('tests the reasoning model only when it differs from the fast one', () => {
    expect(modelsToTest({ provider: 'anthropic', model_fast: 'claude-haiku-5-5', model_reasoning: 'claude-sonnet-5-5' }))
      .toEqual([{ role: 'Fast', model: 'claude-haiku-5-5' }, { role: 'Reasoning', model: 'claude-sonnet-5-5' }]);
    expect(modelsToTest({ provider: 'anthropic', model_fast: 'claude-haiku-5-5', model_reasoning: 'claude-haiku-5-5' }))
      .toEqual([{ role: 'Fast', model: 'claude-haiku-5-5' }]);
  });

  it('has nothing to test for Anthropic without a model, but tests the proxy default', () => {
    expect(modelsToTest({ provider: 'anthropic', model_fast: '', model_reasoning: '' })).toEqual([]);
    expect(modelsToTest({ provider: 'openai_compatible', model_fast: '', model_reasoning: '' })).toEqual([{ role: 'Fast', model: '' }]);
  });
});

describe('isMicrosoftClientId', () => {
  it('accepts the GUID shown as Application (client) ID, with stray spaces', () => {
    expect(isMicrosoftClientId('12345678-90ab-4cde-8f01-23456789abcd')).toBe(true);
    expect(isMicrosoftClientId('  12345678-90AB-4CDE-8F01-23456789ABCD ')).toBe(true);
  });

  it('rejects anything else, such as a secret value or the object ID label', () => {
    expect(isMicrosoftClientId('')).toBe(false);
    expect(isMicrosoftClientId(null)).toBe(false);
    expect(isMicrosoftClientId('12345678-90ab-4cde-8f01')).toBe(false);
    expect(isMicrosoftClientId('abc8Q~secretvalue.with-chars')).toBe(false);
  });
});

describe('describeOneDriveItem', () => {
  it('names a file with its size', () => {
    expect(describeOneDriveItem({ name: 'Laporan.xlsx', is_folder: false, size: 51383 })).toBe('Opened "Laporan.xlsx" (50 KB).');
    expect(describeOneDriveItem({ name: 'Deck.pptx', is_folder: false, size: 5353475 })).toBe('Opened "Deck.pptx" (5.1 MB).');
    expect(describeOneDriveItem({ name: 'a.txt', is_folder: false, size: 12 })).toBe('Opened "a.txt" (12 B).');
  });

  it('names a folder with its item count', () => {
    expect(describeOneDriveItem({ name: 'Evidence Juni', is_folder: true, child_count: 3 })).toBe('Opened folder "Evidence Juni" with 3 items.');
    expect(describeOneDriveItem({ name: 'One', is_folder: true, child_count: 1 })).toBe('Opened folder "One" with 1 item.');
  });
});
