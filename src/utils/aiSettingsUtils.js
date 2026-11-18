export const AI_PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic (Claude API)',
    description: 'Connects straight to api.anthropic.com with your Anthropic API key.',
    keyPlaceholder: 'sk-ant-...',
  },
  {
    id: 'openai_compatible',
    label: 'OpenAI-compatible proxy',
    description: '9router or another endpoint that speaks /v1/chat/completions.',
    keyPlaceholder: 'Proxy API key',
  },
];

export const AI_TIMEOUT_MIN_MS = 5000;
export const AI_TIMEOUT_MAX_MS = 300000;

// Mirrors resolveProvider in supabase/functions/_shared/ai.ts. Settings saved before the
// provider picker existed only have a proxy URL; one at api.anthropic.com was meant for Claude.
export function inferAiProvider(config) {
  if (config?.provider === 'anthropic' || config?.provider === 'openai_compatible') return config.provider;
  return /^https?:\/\/api\.anthropic\.com/i.test(String(config?.proxy_url || '').trim()) ? 'anthropic' : 'openai_compatible';
}

export function normalizeAiConfig(raw) {
  const config = raw || {};
  const provider = inferAiProvider(config);
  return {
    enabled: config.enabled ?? true,
    provider,
    // The Anthropic URL was only ever a workaround for the missing provider picker.
    proxy_url: provider === 'anthropic' ? '' : (config.proxy_url || ''),
    model_fast: config.model_fast || '',
    model_reasoning: config.model_reasoning || '',
    timeout_ms: config.timeout_ms ?? 60000,
    vision: config.vision ?? true,
  };
}

// Returns { config } ready for system_settings.ai_config, or { error } to show the admin.
export function buildAiConfigPayload(form) {
  const timeoutMs = parseInt(form.timeout_ms, 10);
  if (Number.isNaN(timeoutMs) || timeoutMs < AI_TIMEOUT_MIN_MS || timeoutMs > AI_TIMEOUT_MAX_MS) {
    return { error: 'Timeout must be between 5,000 and 300,000 ms.' };
  }

  const isAnthropic = form.provider === 'anthropic';
  const modelFast = String(form.model_fast || '').trim();
  if (isAnthropic && !modelFast) {
    return { error: 'Pick a Fast Model. AI Evidence Assessment runs on it.' };
  }

  return {
    config: {
      enabled: !!form.enabled,
      provider: isAnthropic ? 'anthropic' : 'openai_compatible',
      proxy_url: isAnthropic ? null : (String(form.proxy_url || '').trim() || null),
      model_fast: modelFast || null,
      model_reasoning: String(form.model_reasoning || '').trim() || null,
      timeout_ms: timeoutMs,
      vision: !!form.vision,
    },
  };
}

// Options for a model dropdown: what the provider listed, plus any chosen model it did not
// list, so a saved choice is never silently swapped for the first option. Only a list that
// actually loaded can say a model is missing from it.
export function buildModelOptions(models, selectedIds = [], { listLoaded = true } = {}) {
  const options = (models || []).map((m) => ({ id: m.id, label: m.label && m.label !== m.id ? `${m.label} (${m.id})` : m.id }));
  const listed = new Set(options.map((o) => o.id));
  for (const id of selectedIds) {
    if (id && !listed.has(id)) {
      options.unshift({ id, label: listLoaded ? `${id} (not in the provider's list)` : id, unlisted: true });
      listed.add(id);
    }
  }
  return options;
}

// The Application (client) ID of an app registration in Microsoft Entra.
export function isMicrosoftClientId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function sizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// One line for what the OneDrive link test opened.
export function describeOneDriveItem({ name, is_folder: isFolder, size, child_count: childCount }) {
  if (isFolder) return `Opened folder "${name}" with ${childCount} item${childCount === 1 ? '' : 's'}.`;
  return `Opened "${name}" (${sizeLabel(Number(size) || 0)}).`;
}

// The distinct models a Test run should call: the fast model, and the reasoning model when it
// differs. The executive report falls back to the fast model when no reasoning model is set.
export function modelsToTest(form) {
  const fast = String(form.model_fast || '').trim();
  const reasoning = String(form.model_reasoning || '').trim();
  const runs = [];
  if (fast || form.provider !== 'anthropic') runs.push({ role: 'Fast', model: fast });
  if (reasoning && reasoning !== fast) runs.push({ role: 'Reasoning', model: reasoning });
  return runs;
}
