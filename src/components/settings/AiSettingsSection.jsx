import { useCallback, useEffect, useRef, useState } from 'react';
import { BrainCircuit, CircleCheck, CircleX, Eye, EyeOff, KeyRound, Loader2, PlugZap, RefreshCw, Save, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { useToast } from '../common/Toast';
import ConfirmDialog from '../common/ConfirmDialog';
import { callAiSettings } from '../../services/aiSettingsService';
import {
  AI_PROVIDERS,
  AI_TIMEOUT_MAX_MS,
  AI_TIMEOUT_MIN_MS,
  buildAiConfigPayload,
  buildModelOptions,
  modelsToTest,
  normalizeAiConfig,
} from '../../utils/aiSettingsUtils';

const NO_MODELS = { list: [], loading: false, error: null, loaded: false };
const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500';

function hasKeyFor(status, provider, draftKey = '') {
  return !!(draftKey.trim() || status?.keys?.[provider]?.stored || status?.secret_fallback?.[provider]);
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ModelPicker({ id, label, hint, value, onChange, options, manual, placeholder, disabled }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">{label}</label>
      <p className="text-xs text-gray-500 mt-0.5 mb-2">{hint}</p>
      {manual ? (
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Model name, e.g. kr/glm-5"
          className={INPUT_CLASS}
        />
      ) : (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`${INPUT_CLASS} bg-white disabled:bg-gray-50 disabled:text-gray-400`}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}

// The AI card in Settings → System. The API key goes to the ai-settings edge function, which keeps
// it in Supabase Vault; system_settings.ai_config (readable by every signed-in user) holds the rest.
// The parent remounts this per company, so props are read once.
export default function AiSettingsSection({ companyId, initialConfig, onSaveConfig }) {
  const { toast } = useToast();
  const [initial] = useState(() => normalizeAiConfig(initialConfig));
  const [form, setForm] = useState(initial);
  const [keyDraft, setKeyDraft] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [models, setModels] = useState(NO_MODELS);
  const [testRuns, setTestRuns] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removingKey, setRemovingKey] = useState(false);
  const modelsRequest = useRef(0);

  const provider = form.provider;
  const providerInfo = AI_PROVIDERS.find((p) => p.id === provider) || AI_PROVIDERS[0];
  const isAnthropic = provider === 'anthropic';
  const savedKey = keyStatus?.keys?.[provider];
  const secretFallback = keyStatus?.secret_fallback?.[provider];

  const refreshModels = useCallback(async (providerId, { draftKey, baseUrl } = {}) => {
    const requestId = ++modelsRequest.current;
    setModels((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await callAiSettings('list_models', {
        company_id: companyId,
        provider: providerId,
        base_url: providerId === 'openai_compatible' ? baseUrl : undefined,
        api_key: draftKey || undefined,
      });
      if (requestId !== modelsRequest.current) return;
      setModels({ list: data?.models || [], loading: false, error: data?.error || null, loaded: true });
    } catch (err) {
      if (requestId !== modelsRequest.current) return;
      setModels({ list: [], loading: false, error: err.message, loaded: true });
    }
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    callAiSettings('status', { company_id: companyId })
      .then((data) => {
        if (cancelled) return;
        setKeyStatus(data);
        if (hasKeyFor(data, initial.provider)) refreshModels(initial.provider, { baseUrl: initial.proxy_url });
      })
      .catch((err) => {
        if (!cancelled) setStatusError(err.message);
      });
    return () => { cancelled = true; };
  }, [companyId, initial, refreshModels]);

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleProviderChange = (providerId) => {
    if (providerId === provider) return;
    setForm((prev) => ({ ...prev, provider: providerId }));
    setKeyDraft('');
    setShowKey(false);
    setTestRuns(null);
    modelsRequest.current += 1;
    setModels(NO_MODELS);
    if (hasKeyFor(keyStatus, providerId)) refreshModels(providerId, { baseUrl: form.proxy_url });
  };

  const reloadModels = () => {
    if (!hasKeyFor(keyStatus, provider, keyDraft)) {
      setModels({ ...NO_MODELS, loaded: true, error: 'Paste an API key first.' });
      return;
    }
    refreshModels(provider, { draftKey: keyDraft.trim(), baseUrl: form.proxy_url });
  };

  const handleKeyBlur = () => {
    if (keyDraft.trim()) refreshModels(provider, { draftKey: keyDraft.trim(), baseUrl: form.proxy_url });
  };

  const handleProxyUrlBlur = () => {
    if (form.proxy_url.trim() && hasKeyFor(keyStatus, provider, keyDraft)) reloadModels();
  };

  const handleTest = async () => {
    const runs = modelsToTest(form);
    if (runs.length === 0) {
      toast({ title: 'Pick a Model', description: 'Choose a Fast Model before testing.', variant: 'warning' });
      return;
    }
    const timeoutMs = Number(form.timeout_ms) || 60000;
    setTesting(true);
    setTestRuns(runs.map((run) => ({ ...run, pending: true })));
    const results = await Promise.all(runs.map(async (run) => {
      try {
        const data = await callAiSettings('test', {
          company_id: companyId,
          provider,
          model: run.model,
          base_url: isAnthropic ? undefined : form.proxy_url,
          api_key: keyDraft.trim() || undefined,
          timeout_ms: timeoutMs,
          vision: form.vision,
        }, { timeoutMs: Math.min(timeoutMs, AI_TIMEOUT_MAX_MS) + 30000 });
        return { ...run, ...data, model: data?.model || run.model };
      } catch (err) {
        return { ...run, ok: false, error: err.message };
      }
    }));
    setTestRuns(results);
    setTesting(false);
  };

  const handleSave = async () => {
    const { config, error } = buildAiConfigPayload(form);
    if (error) {
      toast({ title: 'Check AI Settings', description: error, variant: 'warning' });
      return;
    }
    const newKey = keyDraft.trim();
    if (isAnthropic && keyStatus && !newKey && !savedKey?.stored) {
      toast({ title: 'API Key Needed', description: 'Paste your Anthropic API key before saving.', variant: 'warning' });
      return;
    }

    setSaving(true);
    try {
      if (newKey) {
        setKeyStatus(await callAiSettings('save_key', { company_id: companyId, provider, api_key: newKey }));
        setKeyDraft('');
        setShowKey(false);
      }
      await onSaveConfig(config);
      toast({
        title: 'AI Settings Updated',
        description: newKey ? 'API key and AI settings saved.' : 'AI settings saved.',
        variant: 'success',
      });
    } catch (err) {
      console.error('Error saving AI settings:', err);
      toast({ title: 'Error', description: err.message || 'Failed to save AI settings.', variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveKey = async () => {
    setConfirmRemove(false);
    setRemovingKey(true);
    try {
      setKeyStatus(await callAiSettings('delete_key', { company_id: companyId, provider }));
      setTestRuns(null);
      toast({ title: 'API Key Removed', description: `The saved ${providerInfo.label} key was deleted.`, variant: 'success' });
    } catch (err) {
      toast({ title: 'Error', description: err.message || 'Failed to remove the API key.', variant: 'error' });
    } finally {
      setRemovingKey(false);
    }
  };

  const listLoaded = models.loaded && !models.error;
  const modelOptions = buildModelOptions(models.list, [form.model_fast, form.model_reasoning], { listLoaded });
  // Some proxies have no /models endpoint; then the admin types the model name.
  const manualModels = !isAnthropic && !models.loading && models.list.length === 0;
  const modelsDisabled = models.loading || (isAnthropic && modelOptions.length === 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-purple-100 rounded-lg">
            <BrainCircuit className="w-5 h-5 text-purple-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">AI Evidence Assessment</h3>
            <p className="text-sm text-gray-500 mt-0.5">Choose the AI provider, save its API key, and pick the models. The key is stored encrypted on the server and never shown again.</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-100 bg-gray-50">
          <div>
            <p className="font-semibold text-gray-800">Enable AI Analysis</p>
            <p className="text-xs text-gray-500 mt-0.5">When off, scoring modal will return a clear disabled message.</p>
          </div>
          <button
            type="button"
            onClick={() => updateForm('enabled', !form.enabled)}
            aria-label={form.enabled ? 'Disable AI analysis' : 'Enable AI analysis'}
            className={`p-1 rounded-lg transition-colors ${form.enabled ? 'text-purple-700 hover:bg-purple-50' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            {form.enabled ? <ToggleRight className="w-9 h-9" /> : <ToggleLeft className="w-9 h-9" />}
          </button>
        </div>

        <div>
          <p className="block text-sm font-medium text-gray-700 mb-2">Provider</p>
          <div role="radiogroup" aria-label="AI provider" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {AI_PROVIDERS.map((option) => {
              const selected = option.id === provider;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => handleProviderChange(option.id)}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${selected ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}
                >
                  <span className="flex items-center gap-2 font-semibold text-gray-800">
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${selected ? 'border-purple-600' : 'border-gray-300'}`}>
                      {selected && <span className="w-2 h-2 rounded-full bg-purple-600" />}
                    </span>
                    {option.label}
                  </span>
                  <span className="block text-xs text-gray-500 mt-1 ml-6">{option.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        {!isAnthropic && (
          <div>
            <label htmlFor="ai-proxy-url" className="block text-sm font-medium text-gray-700 mb-2">Proxy URL</label>
            <input
              id="ai-proxy-url"
              type="url"
              value={form.proxy_url}
              onChange={(e) => updateForm('proxy_url', e.target.value)}
              onBlur={handleProxyUrlBlur}
              placeholder="https://your-tunnel.example.com/v1"
              className={INPUT_CLASS}
            />
            <p className="text-xs text-gray-500 mt-1">Leave empty to use Supabase secret AI_PROXY_URL.</p>
          </div>
        )}

        <div className="p-4 rounded-xl border border-gray-100 space-y-3">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-purple-700" />
            <label htmlFor="ai-api-key" className="text-sm font-medium text-gray-700">API Key</label>
          </div>

          {statusError ? (
            <p className="text-xs text-red-600">Could not check the saved key: {statusError}</p>
          ) : !keyStatus ? (
            <p className="text-xs text-gray-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking the saved key…</p>
          ) : savedKey?.stored ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm text-gray-700">
                <CircleCheck className="w-4 h-4 text-emerald-600 inline -mt-0.5 mr-1" />
                Saved key <span className="font-mono">{savedKey.hint}</span>
                {savedKey.updated_at && <span className="text-gray-500"> · updated {formatDate(savedKey.updated_at)}</span>}
              </p>
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                disabled={removingKey}
                className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {removingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Remove
              </button>
            </div>
          ) : secretFallback ? (
            <p className="text-xs text-gray-600">No key saved here. Using the Supabase secret <span className="font-mono">{secretFallback}</span> until you save one.</p>
          ) : (
            <p className="text-xs text-amber-700">No key saved yet.</p>
          )}

          <div className="flex gap-2">
            <input
              id="ai-api-key"
              type={showKey ? 'text' : 'password'}
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              onBlur={handleKeyBlur}
              placeholder={savedKey?.stored ? 'Paste a new key to replace the saved one' : providerInfo.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className={`${INPUT_CLASS} font-mono`}
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              className="px-3 border border-gray-300 rounded-lg text-gray-500 hover:bg-gray-50"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {isAnthropic && <>Create one at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" className="text-purple-700 hover:underline">console.anthropic.com</a>. </>}
            A pasted key is used for the model list and Test right away, and saved when you press Save AI Settings.
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-gray-700">Models</p>
            <div className="flex items-center gap-3 text-xs">
              {models.loading ? (
                <span className="text-gray-500 flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading models…</span>
              ) : listLoaded ? (
                <span className="text-gray-500">{models.list.length} model{models.list.length === 1 ? '' : 's'} available</span>
              ) : null}
              <button
                type="button"
                onClick={reloadModels}
                disabled={models.loading}
                className="inline-flex items-center gap-1 text-purple-700 hover:text-purple-800 disabled:opacity-50"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh list
              </button>
            </div>
          </div>
          {models.error && <p className="text-xs text-red-600">{models.error}</p>}
          {isAnthropic && !models.loaded && !models.loading && keyStatus && !hasKeyFor(keyStatus, provider, keyDraft) && (
            <p className="text-xs text-gray-500">Paste an API key to load the models it can use.</p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ModelPicker
              id="ai-model-fast"
              label="Fast Model"
              hint="Runs AI Evidence Assessment in the grading modal."
              value={form.model_fast}
              onChange={(value) => updateForm('model_fast', value)}
              options={modelOptions}
              manual={manualModels}
              placeholder={isAnthropic ? 'Select a model' : 'Proxy default'}
              disabled={modelsDisabled}
            />
            <ModelPicker
              id="ai-model-reasoning"
              label="Reasoning Model"
              hint="Writes the executive report narrative."
              value={form.model_reasoning}
              onChange={(value) => updateForm('model_reasoning', value)}
              options={modelOptions}
              manual={manualModels}
              placeholder="Same as Fast Model"
              disabled={modelsDisabled}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ai-timeout" className="block text-sm font-medium text-gray-700 mb-2">Timeout (ms)</label>
            <input
              id="ai-timeout"
              type="number"
              min={AI_TIMEOUT_MIN_MS}
              max={AI_TIMEOUT_MAX_MS}
              step="1000"
              value={form.timeout_ms}
              onChange={(e) => updateForm('timeout_ms', e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          {!isAnthropic && (
            <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-100">
              <div>
                <p className="font-medium text-gray-800">Vision Mode</p>
                <p className="text-xs text-gray-500 mt-0.5">Sends vision flag to 9router-compatible proxy.</p>
              </div>
              <button
                type="button"
                onClick={() => updateForm('vision', !form.vision)}
                aria-label={form.vision ? 'Turn vision mode off' : 'Turn vision mode on'}
                className={`p-1 rounded-lg transition-colors ${form.vision ? 'text-purple-700 hover:bg-purple-50' : 'text-gray-400 hover:bg-gray-100'}`}
              >
                {form.vision ? <ToggleRight className="w-9 h-9" /> : <ToggleLeft className="w-9 h-9" />}
              </button>
            </div>
          )}
        </div>

        {testRuns && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2" aria-live="polite">
            {testRuns.map((run) => (
              <div key={run.role} className="flex items-start gap-2 text-sm">
                {run.pending ? (
                  <Loader2 className="w-4 h-4 mt-0.5 text-gray-400 animate-spin flex-shrink-0" />
                ) : run.ok ? (
                  <CircleCheck className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                ) : (
                  <CircleX className="w-4 h-4 mt-0.5 text-red-600 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <span className="font-medium text-gray-800">{run.role} · </span>
                  <span className="font-mono text-gray-700">{run.model || 'proxy default'}</span>
                  {run.pending && <span className="text-gray-500"> — testing…</span>}
                  {!run.pending && run.ok && (
                    <span className="text-gray-600"> — answered in {(run.latency_ms / 1000).toFixed(1)} s</span>
                  )}
                  {!run.pending && !run.ok && <p className="text-red-600 break-words">{run.error}</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || saving}
            className="flex items-center gap-2 px-4 py-2 border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />}
            Test Connection
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-purple-700 text-white rounded-lg hover:bg-purple-800 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save AI Settings
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        onConfirm={handleRemoveKey}
        title="Remove API Key?"
        message={`AI features stop working until a new ${providerInfo.label} key is saved${secretFallback ? ` (or they fall back to the Supabase secret ${secretFallback})` : ''}.`}
        confirmText="Remove Key"
      />
    </div>
  );
}
