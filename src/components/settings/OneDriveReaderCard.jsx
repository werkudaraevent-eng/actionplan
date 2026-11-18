import { useEffect, useRef, useState } from 'react';
import { Check, CircleCheck, CircleX, Cloud, Copy, ExternalLink, Loader2, RotateCw, Search, Unlink } from 'lucide-react';
import { useToast } from '../common/Toast';
import ConfirmDialog from '../common/ConfirmDialog';
import { callAiSettings } from '../../services/aiSettingsService';
import { describeOneDriveItem, isMicrosoftClientId } from '../../utils/aiSettingsUtils';

const INPUT_CLASS = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Settings → System card that connects the Microsoft "reader" account AI Evidence Assessment uses
// to open personal OneDrive (1drv.ms) links. Sign-in is Microsoft's device code flow: the admin
// gets a code here, enters it at Microsoft's page, and this card polls until the sign-in lands.
// The parent remounts it per company.
export default function OneDriveReaderCard({ companyId }) {
  const { toast } = useToast();
  const [status, setStatus] = useState(null);
  const [statusError, setStatusError] = useState(null);
  const [clientId, setClientId] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [signIn, setSignIn] = useState(null);
  const [copied, setCopied] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testUrl, setTestUrl] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const pollTimer = useRef(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    callAiSettings('status', { company_id: companyId })
      .then((data) => {
        if (!active.current) return;
        setStatus(data?.onedrive || { connected: false });
        setClientId(data?.onedrive?.client_id || '');
      })
      .catch((err) => {
        if (active.current) setStatusError(err.message);
      });
    return () => {
      active.current = false;
      clearTimeout(pollTimer.current);
    };
  }, [companyId]);

  const stopSignIn = () => {
    clearTimeout(pollTimer.current);
    setSignIn(null);
  };

  const pollAfter = (seconds) => {
    pollTimer.current = setTimeout(async () => {
      try {
        const data = await callAiSettings('onedrive_poll', { company_id: companyId });
        if (!active.current) return;
        if (data.status === 'pending') {
          pollAfter(seconds);
          return;
        }
        setSignIn(null);
        setStatus(data.onedrive);
        if (data.status === 'connected') {
          setShowConnect(false);
          setTestResult(null);
          toast({ title: 'OneDrive Connected', description: `OneDrive links are now read as ${data.account}.`, variant: 'success' });
        } else if (data.status === 'declined') {
          toast({ title: 'Sign-in Declined', description: 'The permission request was declined at Microsoft. Press Connect to try again.', variant: 'warning' });
        } else {
          toast({ title: 'Code Expired', description: 'The sign-in code ran out before it was used. Press Connect for a new one.', variant: 'warning' });
        }
      } catch (err) {
        if (!active.current) return;
        setSignIn(null);
        toast({ title: 'Sign-in Failed', description: err.message, variant: 'error' });
      }
    }, seconds * 1000);
  };

  const handleConnect = async () => {
    if (!isMicrosoftClientId(clientId)) {
      toast({ title: 'Check the Client ID', description: 'Paste the Application (client) ID from the app\'s Overview page in Microsoft Entra.', variant: 'warning' });
      return;
    }
    setSignIn({ starting: true });
    setCopied(false);
    try {
      const data = await callAiSettings('onedrive_connect', { company_id: companyId, client_id: clientId.trim() });
      if (!active.current) return;
      setSignIn({ code: data.user_code, url: data.verification_uri, minutes: Math.round(data.expires_in / 60) });
      pollAfter(data.interval || 5);
    } catch (err) {
      if (!active.current) return;
      setSignIn(null);
      toast({ title: 'Could Not Start Sign-in', description: err.message, variant: 'error' });
    }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(signIn.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleDisconnect = async () => {
    setConfirmDisconnect(false);
    setDisconnecting(true);
    try {
      const data = await callAiSettings('onedrive_disconnect', { company_id: companyId });
      setStatus(data.onedrive);
      setTestResult(null);
      toast({ title: 'OneDrive Disconnected', description: 'OneDrive links are judged by their name only until an account is connected again.', variant: 'success' });
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'error' });
    } finally {
      setDisconnecting(false);
    }
  };

  const handleTest = async () => {
    if (!testUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const data = await callAiSettings('onedrive_test', { company_id: companyId, url: testUrl.trim() });
      setTestResult(data.ok ? { ok: true, text: describeOneDriveItem(data) } : { ok: false, text: data.error });
    } catch (err) {
      setTestResult({ ok: false, text: err.message });
    } finally {
      setTesting(false);
    }
  };

  const connected = !!status?.connected;
  const connectFormOpen = !connected || showConnect;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-sky-50 to-white">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-sky-100 rounded-lg">
            <Cloud className="w-5 h-5 text-sky-700" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800">OneDrive Links</h3>
            <p className="text-sm text-gray-500 mt-0.5">AI Evidence Assessment opens personal OneDrive (1drv.ms) evidence links as one Microsoft account. It reads any link shared with &quot;Anyone with the link&quot;, or shared with this account.</p>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {statusError ? (
          <p className="text-sm text-red-600">Could not check the OneDrive connection: {statusError}</p>
        ) : !status ? (
          <p className="text-sm text-gray-500 flex items-center gap-1.5"><Loader2 className="w-4 h-4 animate-spin" /> Checking the connection…</p>
        ) : connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-700 min-w-0 break-words">
              <CircleCheck className="w-4 h-4 text-emerald-600 inline -mt-0.5 mr-1" />
              Connected as <span className="font-medium">{status.account}</span>
              {status.connected_at && <span className="text-gray-500"> · since {formatDate(status.connected_at)}</span>}
            </p>
            <div className="flex items-center gap-3 text-sm">
              {!showConnect && (
                <button type="button" onClick={() => setShowConnect(true)} className="inline-flex items-center gap-1 text-sky-700 hover:text-sky-800">
                  <RotateCw className="w-3.5 h-3.5" /> Reconnect
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmDisconnect(true)}
                disabled={disconnecting}
                className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-amber-700">Not connected. Until an account is connected, OneDrive links are judged by their name only.</p>
        )}

        {status && connectFormOpen && (
          <div className="p-4 rounded-xl border border-gray-100 space-y-3">
            <div>
              <label htmlFor="onedrive-client-id" className="block text-sm font-medium text-gray-700">Application (client) ID</label>
              <p className="text-xs text-gray-500 mt-0.5 mb-2">From the app registration in Microsoft Entra: Overview → Application (client) ID. It is not a secret.</p>
              <div className="flex flex-wrap gap-2">
                <input
                  id="onedrive-client-id"
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={!!signIn}
                  className={`${INPUT_CLASS} font-mono flex-1 min-w-0 basis-64 disabled:bg-gray-50`}
                />
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={!!signIn}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-700 text-white rounded-lg hover:bg-sky-800 disabled:opacity-50"
                >
                  {signIn?.starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                  {connected ? 'Reconnect' : 'Connect'}
                </button>
                {connected && !signIn && (
                  <button type="button" onClick={() => setShowConnect(false)} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
                )}
              </div>
            </div>

            {signIn?.code && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 space-y-3" aria-live="polite">
                <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                  <li>
                    Open{' '}
                    <a href={signIn.url} target="_blank" rel="noreferrer" className="font-medium text-sky-700 hover:underline inline-flex items-center gap-1">
                      {signIn.url.replace(/^https:\/\//, '')} <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </li>
                  <li className="space-x-2">
                    <span>Enter the code</span>
                    <span className="font-mono text-base font-bold tracking-wider text-gray-900 bg-white border border-sky-200 rounded px-2 py-0.5">{signIn.code}</span>
                    <button type="button" onClick={copyCode} className="inline-flex items-center gap-1 text-xs text-sky-700 hover:text-sky-800 align-middle">
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </li>
                  <li>Sign in with the Microsoft account that will read the links and accept the permission request. Use an account set aside for this: the app can read every file in it.</li>
                </ol>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
                  <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Waiting for the sign-in · the code works for {signIn.minutes} minutes</span>
                  <button type="button" onClick={stopSignIn} className="text-gray-600 hover:text-gray-800 underline">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {connected && (
          <div className="space-y-2">
            <label htmlFor="onedrive-test-url" className="block text-sm font-medium text-gray-700">Test a link</label>
            <div className="flex flex-wrap gap-2">
              <input
                id="onedrive-test-url"
                type="url"
                value={testUrl}
                onChange={(e) => setTestUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleTest(); }}
                placeholder="https://1drv.ms/x/c/…"
                className={`${INPUT_CLASS} flex-1 min-w-0 basis-64`}
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || !testUrl.trim()}
                className="flex items-center gap-2 px-4 py-2 border border-sky-300 text-sky-700 rounded-lg hover:bg-sky-50 disabled:opacity-50"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                Test
              </button>
            </div>
            {testResult && (
              <p className={`text-sm flex items-start gap-1.5 ${testResult.ok ? 'text-gray-700' : 'text-red-600'}`} aria-live="polite">
                {testResult.ok
                  ? <CircleCheck className="w-4 h-4 mt-0.5 text-emerald-600 flex-shrink-0" />
                  : <CircleX className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                <span className="break-words min-w-0">{testResult.text}</span>
              </p>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmDisconnect}
        onClose={() => setConfirmDisconnect(false)}
        onConfirm={handleDisconnect}
        title="Disconnect OneDrive?"
        message="AI Evidence Assessment will judge OneDrive links by their name only until an account is connected again."
        confirmText="Disconnect"
      />
    </div>
  );
}
