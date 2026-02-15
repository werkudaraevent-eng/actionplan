import { useState, useEffect } from 'react';
import {
  Mail,
  Server,
  Bell,
  Send,
  Loader2,
  Eye,
  EyeOff,
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
  Settings2
} from 'lucide-react';
import { useToast } from '../common/Toast';
import { supabase } from '../../lib/supabase';
import { sendCustomEmail, generateTestEmailHtml, getTestEmailSubject } from '../../services/emailService';

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

export default function EmailSettingsSection() {
  const { toast } = useToast();

  // Loading state for initial fetch
  const [loading, setLoading] = useState(true);

  // Active provider state - null until loaded from DB
  const [activeProvider, setActiveProvider] = useState(null);
  const [selectedTab, setSelectedTab] = useState(null);

  // SMTP Configuration (kept for legacy compatibility / send-system-email edge function)
  const [smtpConfig, setSmtpConfig] = useState({
    host: '',
    port: '587',
    username: '',
    password: '',
    security: 'tls'
  });

  // Gmail Configuration (kept for legacy compatibility)
  const [gmailConfig, setGmailConfig] = useState({
    email: '',
    appPassword: ''
  });

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
          // Load SMTP config
          if (config.smtp) {
            setSmtpConfig(prev => ({ ...prev, ...config.smtp }));
          }
          // Load Gmail config
          if (config.gmail) {
            setGmailConfig(prev => ({ ...prev, ...config.gmail }));
          }
          // Load templates
          if (config.templates) {
            setTemplates(prev => ({ ...prev, ...config.templates }));
          }
          // CRITICAL: Set active provider from database
          const savedProvider = config.active_provider || 'smtp';
          setActiveProvider(savedProvider);
          setSelectedTab(savedProvider);
        } else {
          // No saved settings - use defaults
          setActiveProvider('smtp');
          setSelectedTab('smtp');
        }
      } catch (err) {
        console.error('Failed to fetch email settings:', err);
        // Fallback to defaults on error
        setActiveProvider('smtp');
        setSelectedTab('smtp');
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSmtpChange = (field, value) => {
    setSmtpConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleGmailChange = (field, value) => {
    setGmailConfig(prev => ({ ...prev, [field]: value }));
  };

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

  const saveTemplate = () => {
    if (!editingTemplate) return;

    const meta = TEMPLATE_META[editingTemplate];

    setTemplates(prev => ({
      ...prev,
      [editingTemplate]: {
        ...prev[editingTemplate],
        subject: templateDraft.subject,
        body: templateDraft.body,
        ...(meta.hasSchedule && templateDraft.schedule && { schedule: templateDraft.schedule }),
        ...(meta.hasScope && templateDraft.scope && { scope: templateDraft.scope })
      }
    }));

    toast({
      title: 'Template Saved',
      description: `${meta.title} template updated.`,
      variant: 'success'
    });

    closeTemplateEditor();
  };

  const sendTestEmail = async () => {
    if (!editingTemplate) return;

    setSendingTest(true);
    try {
      // Use current form values (so user can test before saving)
      const config = activeProvider === 'gmail'
        ? { ...gmailConfig, type: 'gmail' }
        : { ...smtpConfig, type: 'smtp' };

      const template = {
        subject: templateDraft.subject,
        body: templateDraft.body
      };

      // Call Edge Function
      const { data, error } = await supabase.functions.invoke('send-system-email', {
        body: {
          providerConfig: config,
          template: template
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Test Email Sent',
          description: data.message || 'Check your inbox for the test email.',
          variant: 'success'
        });
      } else {
        throw new Error(data?.message || 'Failed to send email');
      }
    } catch (err) {
      console.error('Send test email error:', err);
      toast({
        title: 'Send Failed',
        description: err.message || 'Could not send test email.',
        variant: 'error'
      });
    } finally {
      setSendingTest(false);
    }
  };

  // Quick test from the notification row (uses Resend via send-email Edge Function)
  const handleQuickTest = async (templateKey) => {
    setSendingTestKey(templateKey);
    try {
      // Get the admin's email from the current session
      const { data: { user } } = await supabase.auth.getUser();
      const adminEmail = user?.email;
      if (!adminEmail) throw new Error('Could not determine your email address.');

      const subject = getTestEmailSubject(templateKey);
      const html = generateTestEmailHtml(templateKey);

      await sendCustomEmail(adminEmail, subject, html);

      toast({
        title: 'Test Email Sent',
        description: `Sent to ${adminEmail}. Check your inbox!`,
        variant: 'success'
      });
    } catch (err) {
      console.error('Quick test email error:', err);
      toast({
        title: 'Send Failed',
        description: err.message || 'Could not send test email.',
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
        active_provider: activeProvider,
        smtp: smtpConfig,
        gmail: gmailConfig,
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
        description: 'Email configuration has been updated.',
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

          {/* Email Provider Info Banner */}
          <div className="p-5 border-b border-gray-100">
            <div className="flex items-start gap-3 p-4 bg-gradient-to-r from-teal-50 to-emerald-50 rounded-xl border border-teal-200">
              <div className="p-2 bg-teal-100 rounded-lg shrink-0 mt-0.5">
                <Zap className="w-4 h-4 text-teal-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="text-sm font-semibold text-teal-800">Resend Email Service</p>
                  <span className="px-2 py-0.5 bg-teal-100 text-teal-700 text-[10px] font-bold rounded-full">ACTIVE</span>
                </div>
                <p className="text-xs text-teal-600 leading-relaxed">
                  Transactional emails are sent via Resend (Supabase Edge Function).
                  Use the <strong>Send Test</strong> button on each notification to verify delivery to your inbox.
                </p>
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
 * Provider Tab Button
 */
function ProviderTab({ provider, label, sublabel, icon: Icon, isSelected, isActive, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-all relative ${isSelected
        ? 'border-teal-500 bg-teal-50'
        : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
    >
      {/* Active Badge */}
      {isActive && (
        <span className="absolute -top-2 -right-2 px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full uppercase tracking-wide">
          Active
        </span>
      )}

      <div className={`p-2 rounded-lg ${isSelected ? 'bg-teal-100' : 'bg-gray-100'}`}>
        <Icon className={`w-5 h-5 ${isSelected ? 'text-teal-600' : 'text-gray-500'}`} />
      </div>
      <div className="text-left">
        <p className={`font-semibold ${isSelected ? 'text-teal-700' : 'text-gray-700'}`}>
          {label}
        </p>
        <p className="text-xs text-gray-500">{sublabel}</p>
      </div>
      {isSelected && (
        <CheckCircle className="w-5 h-5 text-teal-600 ml-auto" />
      )}
    </button>
  );
}

/**
 * SMTP Configuration Form
 */
function SmtpForm({ config, onChange, showPassword, onTogglePassword }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">SMTP Host</label>
          <input
            type="text"
            value={config.host}
            onChange={(e) => onChange('host', e.target.value)}
            placeholder="smtp.office365.com"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Port</label>
          <input
            type="text"
            value={config.port}
            onChange={(e) => onChange('port', e.target.value)}
            placeholder="587"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Username / Email</label>
          <input
            type="text"
            value={config.username}
            onChange={(e) => onChange('username', e.target.value)}
            placeholder="noreply@company.com"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={config.password}
              onChange={(e) => onChange('password', e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={onTogglePassword}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Security Protocol</label>
        <div className="flex gap-3">
          {['tls', 'ssl', 'none'].map((option) => (
            <button
              key={option}
              onClick={() => onChange('security', option)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${config.security === option
                ? 'bg-teal-100 text-teal-700 border-2 border-teal-500'
                : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                }`}
            >
              {option.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Gmail Configuration Form
 */
function GmailForm({ config, onChange, showPassword, onTogglePassword }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Gmail Address</label>
        <input
          type="email"
          value={config.email}
          onChange={(e) => onChange('email', e.target.value)}
          placeholder="your-email@gmail.com"
          className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">App Password (16 characters)</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={config.appPassword}
            onChange={(e) => onChange('appPassword', e.target.value.replace(/\s/g, ''))}
            placeholder="xxxx xxxx xxxx xxxx"
            maxLength={16}
            className="w-full px-3 py-2.5 pr-10 border border-gray-300 rounded-lg text-sm font-mono tracking-wider focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={onTogglePassword}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2 flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          Use an App Password from Google Account Security. Do not use your login password.
        </p>
      </div>
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
