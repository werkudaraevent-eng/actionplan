import { useState, useEffect } from 'react';
import {
  Mail,
  Bell,
  Send,
  Loader2,
  CheckCircle,
  XCircle,
  Lock,
  Calendar,
  Star,
  AlertTriangle,
  Pencil,
  X,
  Zap,
  Info,
  Clock,
  FileText,
  Settings2,
  ShieldCheck,
  Server
} from 'lucide-react';
import { useToast } from '../common/Toast';
import { supabase } from '../../lib/supabase';
import { generateTestEmailHtml, getTestEmailSubject } from '../../services/emailService';

// Priority scope options
const PRIORITY_SCOPES = [
  { id: 'UH', label: 'Ultra High' },
  { id: 'H', label: 'High' },
  { id: 'M', label: 'Medium' },
  { id: 'L', label: 'Low' }
];

// Default template content
const DEFAULT_TEMPLATES = {
  password_reset: {
    enabled: true,
    subject: 'Reset Your Password - Werkudara Group',
    body: `Hi {name},

We received a request to reset your password for the Action Plan Tracker.

Click the link below to set a new password:
{link}

This link will expire in 24 hours.

If you didn't request this, you can safely ignore this email.

Best regards,
Werkudara Group`
  },
  deadline_reminder: {
    enabled: true,
    subject: 'Action Plan Deadline Reminder - {month} {year}',
    body: `Hi {name},

This is a friendly reminder that the deadline for {month} {year} action plans is approaching.

Lock Date: {lock_date}
Days Remaining: {days_remaining}

Please ensure all your action plans are updated before the lock date.

Best regards,
Werkudara Group`,
    schedule: {
      h_minus_3: true,
      h_minus_1: true,
      h_0: false,
      time: '09:00'
    },
    scope: ['UH', 'H', 'M', 'L'] // All priorities
  },
  critical_alert: {
    enabled: true,
    subject: '⚠️ URGENT: Critical Action Plan Deadline - {month} {year}',
    body: `Hi {name},

🚨 CRITICAL PRIORITY ALERT 🚨

You have HIGH PRIORITY action plans that require immediate attention before the upcoming deadline.

Lock Date: {lock_date}
Days Remaining: {days_remaining}
Priority Level: {priority}

These plans are marked as critical and must be completed on time.

Please take action immediately.

Best regards,
Werkudara Group`,
    schedule: {
      h_minus_3: false,
      h_minus_1: true,
      h_0: true,
      time: '08:00'
    },
    scope: ['UH', 'H'] // High priority only
  },
  auto_lock: {
    enabled: true,
    subject: 'Monthly Lock Applied - {month} {year}',
    body: `Hi {name},

The action plans for {month} {year} have been officially locked.

Lock Date: {lock_date}
Total Plans: {total_plans}
Achieved: {achieved_count}

No further edits can be made to this period without admin approval.

Best regards,
Werkudara Group`
  },
  grading_update: {
    enabled: false,
    subject: 'Your Action Plan Has Been Graded',
    body: `Hi {name},

Your action plan "{plan_title}" has received a verification score.

Score: {score}/100
Feedback: {feedback}

View details in the Action Plan Tracker.

Best regards,
Werkudara Group`
  }
};

// Template metadata for display
const TEMPLATE_META = {
  password_reset: {
    icon: Lock,
    title: 'Password Reset Emails',
    description: 'Allow users to request password resets via email',
    variables: ['name', 'link', 'email'],
    hasSchedule: false,
    hasScope: false
  },
  deadline_reminder: {
    icon: Calendar,
    title: 'Standard Deadline Reminder',
    description: null, // Dynamic - computed from schedule
    variables: ['name', 'month', 'year', 'lock_date', 'days_remaining', 'department'],
    hasSchedule: true,
    hasScope: true
  },
  critical_alert: {
    icon: AlertTriangle,
    title: 'Critical Priority Escalation',
    description: null, // Dynamic - computed from schedule
    variables: ['name', 'month', 'year', 'lock_date', 'days_remaining', 'department', 'priority'],
    hasSchedule: true,
    hasScope: true
  },
  auto_lock: {
    icon: Lock,
    title: 'Auto-Lock Notification',
    description: 'Notify Admins and Leaders when a month is officially locked',
    variables: ['name', 'month', 'year', 'lock_date', 'total_plans', 'achieved_count'],
    hasSchedule: false,
    hasScope: false
  },
  grading_update: {
    icon: Star,
    title: 'Grading Updates',
    description: 'Notify users when their action plan receives a grade',
    variables: ['name', 'plan_title', 'score', 'feedback', 'reviewer_name'],
    hasSchedule: false,
    hasScope: false
  }
};

// Helper to generate dynamic schedule description
const getScheduleSummary = (schedule, scope) => {
  if (!schedule) return "No schedule configured";

  const activeTriggers = [];
  if (schedule.h_minus_3) activeTriggers.push("H-3");
  if (schedule.h_minus_1) activeTriggers.push("H-1");
  if (schedule.h_0) activeTriggers.push("H-0");

  if (activeTriggers.length === 0) return "No active triggers set";

  // Build scope label
  let scopeLabel = '';
  if (scope && scope.length > 0) {
    if (scope.length === 4) {
      scopeLabel = 'All priorities';
    } else {
      const scopeNames = scope.map(s => {
        const found = PRIORITY_SCOPES.find(p => p.id === s);
        return found ? found.label : s;
      });
      scopeLabel = scopeNames.join(', ');
    }
  }

  const triggerText = activeTriggers.join(", ");
  return scopeLabel ? `${triggerText} • ${scopeLabel}` : triggerText;
};

// Compile a draft template by replacing {variables} with dummy data and wrapping in styled HTML
const compileDraftTemplate = (subject, body) => {
  const dummyData = {
    name: 'Hanung (Tester)',
    email: 'hanung@werkudara.com',
    link: 'https://actionplan2026.netlify.app/reset?token=demo123',
    month: 'February',
    year: '2026',
    lock_date: 'Feb 25, 2026',
    days_remaining: '5',
    department: 'IT Dev',
    priority: 'High',
    total_plans: '18',
    achieved_count: '14',
    plan_title: 'Q1 System Upgrade',
    score: '88',
    feedback: 'Excellent progress.',
    reviewer_name: 'Admin Werkudara',
  };

  // Replace all {variable} occurrences in both subject and body
  let compiledSubject = subject;
  let compiledBody = body;
  for (const [key, value] of Object.entries(dummyData)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    compiledSubject = compiledSubject.replace(regex, value);
    compiledBody = compiledBody.replace(regex, value);
  }

  // Convert newlines to <br/> and wrap in a styled container
  const htmlBody = `
    <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #333; line-height: 1.7; max-width: 560px; margin: 0 auto; padding: 24px;">
      ${compiledBody.replace(/\n/g, '<br/>')}
    </div>
  `.trim();

  return { subject: compiledSubject, html: htmlBody };
};

export default function EmailSettingsSection() {
  const { toast } = useToast();

  // Loading state for initial fetch
  const [loading, setLoading] = useState(true);

  // Templates state
  const [templates, setTemplates] = useState(DEFAULT_TEMPLATES);

  // Modal state
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateDraft, setTemplateDraft] = useState({ subject: '', body: '' });

  // UI State
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [sendingTestKey, setSendingTestKey] = useState(null); // which row is sending a test

  // Fetch settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('*')
          .eq('id', 1)
          .single();

        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching email settings:', error);
        }

        if (data?.email_config) {
          const config = data.email_config;
          // Load templates
          if (config.templates) {
            setTemplates(prev => ({ ...prev, ...config.templates }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch email settings:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleToggleTemplate = (key) => {
    setTemplates(prev => ({
      ...prev,
      [key]: { ...prev[key], enabled: !prev[key].enabled }
    }));
  };

  const openTemplateEditor = (key) => {
    setEditingTemplate(key);
    const template = templates[key];
    const meta = TEMPLATE_META[key];

    // Get default scope based on template type
    const defaultScope = key === 'critical_alert'
      ? ['UH', 'H']
      : ['UH', 'H', 'M', 'L'];

    setTemplateDraft({
      subject: template.subject,
      body: template.body,
      schedule: meta.hasSchedule ? (template.schedule || {
        h_minus_3: true,
        h_minus_1: true,
        h_0: false,
        time: '09:00'
      }) : null,
      scope: meta.hasScope ? (template.scope || defaultScope) : null
    });
  };

  const closeTemplateEditor = () => {
    setEditingTemplate(null);
    setTemplateDraft({ subject: '', body: '', schedule: null, scope: null });
  };

  const saveTemplate = async () => {
    if (!editingTemplate) return;

    setSaving(true);
    try {
      const meta = TEMPLATE_META[editingTemplate];

      // 1. Prepare the updated template data
      const updatedTemplateData = {
        ...templates[editingTemplate],
        subject: templateDraft.subject,
        body: templateDraft.body,
        ...(meta.hasSchedule && templateDraft.schedule && { schedule: templateDraft.schedule }),
        ...(meta.hasScope && templateDraft.scope && { scope: templateDraft.scope })
      };

      // 2. Merge into full templates object
      const newTemplates = {
        ...templates,
        [editingTemplate]: updatedTemplateData
      };

      // 3. Build the full email_config payload for the database
      const fullEmailConfig = {
        active_provider: 'smtp_secure',
        templates: newTemplates
      };

      // 4. Persist to Supabase
      const { error } = await supabase
        .from('system_settings')
        .update({
          email_config: fullEmailConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);

      if (error) throw error;

      // 5. Update local state & close modal only on success
      setTemplates(newTemplates);
      toast({
        title: 'Template Saved',
        description: `${meta.title} updated successfully.`,
        variant: 'success'
      });
      closeTemplateEditor();

    } catch (err) {
      console.error('Failed to save template:', err);
      toast({
        title: 'Save Failed',
        description: err.message,
        variant: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  // Send test email from the template editor modal (uses server-side SMTP)
  const sendTestEmail = async () => {
    if (!editingTemplate) return;

    setSendingTest(true);
    try {
      // 1. Get Admin Email
      const { data: { user } } = await supabase.auth.getUser();
      const adminEmail = user?.email;
      if (!adminEmail) throw new Error('Could not determine your email address.');

      // 2. COMPILE THE DRAFT (Crucial Step)
      // We must use templateDraft.subject and templateDraft.body
      // NOT the saved template and NOT the hardcoded generator
      const { subject, html } = compileDraftTemplate(
        templateDraft.subject,
        templateDraft.body
      );

      // 3. Invoke Edge Function
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: adminEmail,
          subject: `[DRAFT TEST] ${subject}`,
          html: html
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Draft Test Sent',
          description: `Check inbox for: "${subject}"`,
          variant: 'success'
        });
      } else {
        throw new Error(data?.message || 'Failed to send email');
      }
    } catch (err) {
      console.error('Send test email error:', err);
      toast({
        title: 'Send Failed',
        description: err.message,
        variant: 'error'
      });
    } finally {
      setSendingTest(false);
    }
  };

  // Quick test from the notification row — sends the SAVED template from state
  const handleQuickTest = async (templateKey) => {
    setSendingTestKey(templateKey);
    try {
      // 1. Get Admin Email
      const { data: { user } } = await supabase.auth.getUser();
      const adminEmail = user?.email;
      if (!adminEmail) throw new Error('Could not determine your email address.');

      // 2. Get the SAVED template from state
      const template = templates[templateKey];
      if (!template) throw new Error('Template not found');

      // 3. Compile using the helper (Swaps variables & fixes newlines)
      const { subject, html } = compileDraftTemplate(template.subject, template.body);

      // 4. Send via Edge Function
      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: adminEmail,
          subject: `[QUICK TEST] ${subject}`,
          html: html
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Test Email Sent',
          description: `Sent to ${adminEmail}`,
          variant: 'success'
        });
      } else {
        throw new Error(data?.message || 'Failed to send email');
      }
    } catch (err) {
      console.error('Quick test email error:', err);
      toast({
        title: 'Send Failed',
        description: err.message,
        variant: 'error'
      });
    } finally {
      setSendingTestKey(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const emailConfig = {
        active_provider: 'smtp_secure',  // Server-side SMTP via Supabase Secrets
        templates: templates
      };

      // Update the email_config column in system_settings (id=1)
      const { error } = await supabase
        .from('system_settings')
        .update({
          email_config: emailConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1);

      if (error) throw error;

      toast({
        title: 'Settings Saved',
        description: 'Email templates have been updated.',
        variant: 'success'
      });
    } catch (err) {
      console.error('Failed to save email settings:', err);
      toast({
        title: 'Save Failed',
        description: err.message || 'Could not save email settings.',
        variant: 'error'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Loading State */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 flex flex-col items-center justify-center">
          <Loader2 className="w-8 h-8 text-teal-600 animate-spin mb-3" />
          <p className="text-gray-500 text-sm">Loading email settings...</p>
        </div>
      ) : (
        /* Main Card: Email Service Configuration */
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          {/* Header */}
          <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-100 rounded-lg">
                <Mail className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Email Service Configuration</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Manage automated email notifications and alerts
                </p>
              </div>
            </div>
          </div>

          {/* Secure SMTP Status Card */}
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-200">
              <div className="p-2.5 bg-emerald-100 rounded-lg shrink-0 mt-0.5">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="text-sm font-semibold text-emerald-800">Secure Server-Side SMTP</p>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full tracking-wide">ACTIVE</span>
                </div>
                <p className="text-xs text-emerald-700 leading-relaxed">
                  Emails are sent via <strong>Nodemailer</strong> through a Supabase Edge Function.
                  SMTP credentials are securely stored in <strong>Supabase Secrets</strong> — they are never exposed to the browser.
                </p>
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <Server className="w-3.5 h-3.5" />
                    <span>Edge Function: <code className="font-mono bg-emerald-100 px-1 py-0.5 rounded text-[10px]">send-email</code></span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Credentials: Supabase Secrets</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notification Templates */}
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-gray-500" />
              <label className="text-sm font-semibold text-gray-700">
                Automatic Blasts & Alerts
              </label>
            </div>

            <div className="space-y-3">
              {Object.entries(TEMPLATE_META).map(([key, meta]) => {
                // Compute dynamic description for templates with schedules
                const template = templates[key];
                const description = meta.hasSchedule
                  ? getScheduleSummary(template?.schedule, template?.scope)
                  : meta.description;

                return (
                  <NotificationRow
                    key={key}
                    templateKey={key}
                    icon={meta.icon}
                    title={meta.title}
                    description={description}
                    enabled={template?.enabled ?? false}
                    onToggle={() => handleToggleTemplate(key)}
                    onEdit={() => openTemplateEditor(key)}
                    onSendTest={() => handleQuickTest(key)}
                    isSendingTest={sendingTestKey === key}
                  />
                );
              })}
            </div>
          </div>

          {/* Save Footer */}
          <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Template Editor Modal */}
      {editingTemplate && (
        <TemplateEditorModal
          templateKey={editingTemplate}
          meta={TEMPLATE_META[editingTemplate]}
          draft={templateDraft}
          onDraftChange={setTemplateDraft}
          onSave={saveTemplate}
          onClose={closeTemplateEditor}
          onSendTest={sendTestEmail}
          sendingTest={sendingTest}
        />
      )}
    </div>
  );
}


/**
 * Notification Row with Toggle, Edit, and Send Test buttons
 */
function NotificationRow({ templateKey, icon: Icon, title, description, enabled, onToggle, onEdit, onSendTest, isSendingTest }) {
  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${enabled ? 'bg-teal-100' : 'bg-gray-200'}`}>
          <Icon className={`w-4 h-4 ${enabled ? 'text-teal-600' : 'text-gray-500'}`} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-800">{title}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Send Test Email Button */}
        <button
          onClick={onSendTest}
          disabled={isSendingTest}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Send a test email to your inbox"
        >
          {isSendingTest ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Send className="w-3.5 h-3.5" />
          )}
          {isSendingTest ? 'Sending...' : 'Send Test'}
        </button>
        {/* Edit Template Button */}
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          Edit
        </button>
        {/* Toggle */}
        <button
          onClick={onToggle}
          className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-teal-600' : 'bg-gray-300'
            }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
          />
        </button>
      </div>
    </div>
  );
}

/**
 * Template Editor Modal with Tabs (Schedule, Scope & Template)
 */
function TemplateEditorModal({ templateKey, meta, draft, onDraftChange, onSave, onClose, onSendTest, sendingTest }) {
  const [activeTab, setActiveTab] = useState('template');
  const hasSchedule = meta.hasSchedule;
  const hasScope = meta.hasScope;
  const hasTabs = hasSchedule || hasScope;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${templateKey === 'critical_alert' ? 'bg-amber-100' : 'bg-teal-100'}`}>
              <meta.icon className={`w-5 h-5 ${templateKey === 'critical_alert' ? 'text-amber-600' : 'text-teal-600'}`} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">Edit {meta.title}</h3>
              <p className="text-sm text-gray-500">Customize the email template</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs (show for templates with schedule or scope) */}
        {hasTabs && (
          <div className="px-5 pt-4 border-b border-gray-100">
            <div className="flex gap-1">
              {hasSchedule && (
                <button
                  onClick={() => setActiveTab('schedule')}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeTab === 'schedule'
                    ? 'text-teal-700 border-teal-600 bg-teal-50'
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <Settings2 className="w-4 h-4" />
                  Schedule
                </button>
              )}
              {hasScope && (
                <button
                  onClick={() => setActiveTab('scope')}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeTab === 'scope'
                    ? 'text-teal-700 border-teal-600 bg-teal-50'
                    : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <Zap className="w-4 h-4" />
                  Priority Scope
                </button>
              )}
              <button
                onClick={() => setActiveTab('template')}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${activeTab === 'template'
                  ? 'text-teal-700 border-teal-600 bg-teal-50'
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
                  }`}
              >
                <FileText className="w-4 h-4" />
                Email Template
              </button>
            </div>
          </div>
        )}

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {/* Schedule Tab Content */}
          {hasSchedule && activeTab === 'schedule' && (
            <ScheduleTabContent
              schedule={draft.schedule}
              onChange={(schedule) => onDraftChange({ ...draft, schedule })}
            />
          )}

          {/* Scope Tab Content */}
          {hasScope && activeTab === 'scope' && (
            <ScopeTabContent
              scope={draft.scope}
              onChange={(scope) => onDraftChange({ ...draft, scope })}
              templateKey={templateKey}
            />
          )}

          {/* Template Tab Content */}
          {(!hasTabs || activeTab === 'template') && (
            <TemplateTabContent
              draft={draft}
              onDraftChange={onDraftChange}
              variables={meta.variables}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <button
            onClick={onSendTest}
            disabled={sendingTest}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {sendingTest ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {sendingTest ? 'Sending...' : 'Send Test Email'}
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-gray-600 text-sm font-medium hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              Save Template
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Schedule Tab Content - Trigger checkboxes and time picker
 */
function ScheduleTabContent({ schedule, onChange }) {
  const handleToggle = (key) => {
    onChange({ ...schedule, [key]: !schedule[key] });
  };

  const handleTimeChange = (time) => {
    onChange({ ...schedule, time });
  };

  return (
    <div className="space-y-6">
      {/* Trigger Schedule */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Trigger Schedule
        </label>
        <p className="text-xs text-gray-500 mb-4">
          Select when reminder emails should be sent relative to the lock date.
        </p>
        <div className="space-y-3">
          <ScheduleCheckbox
            checked={schedule.h_minus_3}
            onChange={() => handleToggle('h_minus_3')}
            label="3 Days Before (H-3)"
            description="Send reminder 3 days before the lock date"
          />
          <ScheduleCheckbox
            checked={schedule.h_minus_1}
            onChange={() => handleToggle('h_minus_1')}
            label="1 Day Before (H-1)"
            description="Send reminder 1 day before the lock date"
          />
          <ScheduleCheckbox
            checked={schedule.h_0}
            onChange={() => handleToggle('h_0')}
            label="On Deadline Date (H-0)"
            description="Send reminder on the lock date itself"
          />
        </div>
      </div>

      {/* Delivery Time */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Delivery Time
        </label>
        <p className="text-xs text-gray-500 mb-4">
          Set the time when reminder emails will be sent (local server time).
        </p>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="time"
              value={schedule.time}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            />
          </div>
          <span className="text-sm text-gray-500">
            Emails will be sent at this time on scheduled days
          </span>
        </div>
      </div>

      {/* Info Box */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Scheduling Note</p>
            <p className="text-xs text-amber-700 mt-1">
              Reminder emails are sent automatically based on the monthly lock schedule configured in Admin Settings.
              Make sure at least one trigger is enabled for reminders to be sent.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Schedule Checkbox Component
 */
function ScheduleCheckbox({ checked, onChange, label, description }) {
  return (
    <label className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 w-5 h-5 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
      />
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
    </label>
  );
}

/**
 * Scope Tab Content - Priority scope selection
 */
function ScopeTabContent({ scope, onChange, templateKey }) {
  const handleToggle = (priorityId) => {
    const newScope = scope.includes(priorityId)
      ? scope.filter(s => s !== priorityId)
      : [...scope, priorityId];
    onChange(newScope);
  };

  const isCriticalAlert = templateKey === 'critical_alert';

  return (
    <div className="space-y-6">
      {/* Priority Scope */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Target Priority Levels
        </label>
        <p className="text-xs text-gray-500 mb-4">
          Select which action plan priorities should receive this notification.
        </p>
        <div className="space-y-3">
          {PRIORITY_SCOPES.map((priority) => (
            <label
              key={priority.id}
              className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200 hover:border-gray-300 cursor-pointer transition-colors"
            >
              <input
                type="checkbox"
                checked={scope.includes(priority.id)}
                onChange={() => handleToggle(priority.id)}
                className="mt-0.5 w-5 h-5 text-teal-600 border-gray-300 rounded focus:ring-teal-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-800">{priority.label}</p>
                <p className="text-xs text-gray-500">
                  {priority.id === 'UH' && 'Mission-critical action plans requiring immediate attention'}
                  {priority.id === 'H' && 'High-impact action plans with tight deadlines'}
                  {priority.id === 'M' && 'Standard priority action plans'}
                  {priority.id === 'L' && 'Lower priority action plans with flexible timelines'}
                </p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div className={`p-4 rounded-xl border ${isCriticalAlert ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
        <div className="flex items-start gap-3">
          {isCriticalAlert ? (
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          ) : (
            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <p className={`text-sm font-medium ${isCriticalAlert ? 'text-amber-800' : 'text-blue-800'}`}>
              {isCriticalAlert ? 'Critical Alert Scope' : 'Standard Reminder Scope'}
            </p>
            <p className={`text-xs mt-1 ${isCriticalAlert ? 'text-amber-700' : 'text-blue-700'}`}>
              {isCriticalAlert
                ? 'Critical alerts are designed for high-priority items. Consider limiting scope to Ultra High and High priorities for maximum impact.'
                : 'Standard reminders can target all priority levels. Users will receive reminders for action plans matching the selected priorities.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Template Tab Content - Subject and Body editor
 */
function TemplateTabContent({ draft, onDraftChange, variables }) {
  return (
    <>
      {/* Subject Line */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Subject Line
        </label>
        <input
          type="text"
          value={draft.subject}
          onChange={(e) => onDraftChange({ ...draft, subject: e.target.value })}
          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
          placeholder="Enter email subject..."
        />
      </div>

      {/* Email Body */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Email Body
        </label>
        <textarea
          value={draft.body}
          onChange={(e) => onDraftChange({ ...draft, body: e.target.value })}
          rows={12}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-none"
          placeholder="Enter email body..."
        />
      </div>

      {/* Available Variables */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <Info className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-blue-800">Available Variables</span>
        </div>
        <p className="text-xs text-blue-700 mb-2">
          Use these placeholders in your template. They will be replaced with actual values when the email is sent.
        </p>
        <div className="flex flex-wrap gap-2">
          {variables.map((variable) => (
            <code
              key={variable}
              className="px-2 py-1 bg-white text-blue-700 text-xs font-mono rounded border border-blue-200"
            >
              {`{${variable}}`}
            </code>
          ))}
        </div>
      </div>
    </>
  );
}
