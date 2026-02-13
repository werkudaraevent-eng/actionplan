import { useState, useEffect, useRef } from 'react';
import { X, Copy, Check, User, Calendar, Building2, Target, Flag, FileText, Sparkles, CheckCircle, Star, ExternalLink, Lock, Clock, Loader2, History, ShieldAlert, ArrowUpCircle, Edit3, Send, MoreHorizontal, Pencil, List, Hourglass, Megaphone, Image, FileSpreadsheet, Download, Link2 } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { supabase, withTimeout } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import { getBlockedDays, getBlockedSeverity } from '../../utils/escalationUtils';
import { extractMentionIds, getPlainTextFromMentions } from '../../utils/mentionUtils';
import MentionInput from '../common/MentionInput';
import SharedHistoryTimeline from './SharedHistoryTimeline';

// Priority badge colors
const PRIORITY_COLORS = {
  'UH': 'bg-red-100 text-red-700 border-red-200',
  'H': 'bg-orange-100 text-orange-700 border-orange-200',
  'M': 'bg-amber-100 text-amber-700 border-amber-200',
  'L': 'bg-green-100 text-green-700 border-green-200',
};

// Status colors for display
const STATUS_COLORS = {
  'Open': 'bg-gray-100 text-gray-700',
  'On Progress': 'bg-yellow-100 text-yellow-700',
  'Achieved': 'bg-green-100 text-green-700',
  'Not Achieved': 'bg-red-100 text-red-700',
};

// Extract priority code from category string
const getPriorityCode = (category) => {
  if (!category) return null;
  const code = category.split(/[\s(]/)[0].toUpperCase();
  return ['UH', 'H', 'M', 'L'].includes(code) ? code : null;
};

// Helper to detect if a string is a valid URL
const isUrl = (string) => {
  if (!string) return false;
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

// Helper: file type icon for attachments
const getAttachmentIcon = (item) => {
  if (item.type === 'link') return <Link2 className="w-4 h-4 text-indigo-500" />;
  const mime = item.mime || '';
  if (mime.startsWith('image/')) return <Image className="w-4 h-4 text-blue-500" />;
  if (mime === 'application/pdf') return <FileText className="w-4 h-4 text-red-500" />;
  if (mime.includes('spreadsheet') || mime.includes('csv')) return <FileSpreadsheet className="w-4 h-4 text-green-600" />;
  return <FileText className="w-4 h-4 text-orange-500" />;
};

// Helper: format file size
const formatFileSize = (bytes) => {
  if (!bytes || typeof bytes !== 'number') return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ViewDetailModal({ plan: initialPlan, onClose, onEscalate, onEdit, onUpdateStatus, onRefresh }) {
  const { profile, isAdmin, isLeader, isExecutive, isStaff } = useAuth();
  const { toast } = useToast();

  // Local plan state to reflect updates without closing modal
  const [plan, setPlan] = useState(initialPlan);
  const [copied, setCopied] = useState(false);
  const [unifiedTimeline, setUnifiedTimeline] = useState([]); // Combined progress + audit logs
  const [logsLoading, setLogsLoading] = useState(false);

  // Post update state
  const [newMessage, setNewMessage] = useState('');
  const [posting, setPosting] = useState(false);
  const commentRef = useRef(null);

  // Executive decision panel state
  const [execInstruction, setExecInstruction] = useState('');
  const execInstructionRef = useRef(null);

  // Sync plan when initialPlan changes
  useEffect(() => {
    setPlan(initialPlan);
  }, [initialPlan]);

  // Permission check
  const userName = profile?.full_name || '';
  const normalizedUserName = userName.trim().toLowerCase();
  const normalizedPic = (plan?.pic || '').trim().toLowerCase();
  const isPlanOwner = normalizedUserName && normalizedPic && normalizedUserName === normalizedPic;
  const canTakeAction = isAdmin || isLeader || isPlanOwner;

  // Separate permission for commenting — executives can comment but not edit plan data
  const canComment = isAdmin || isLeader || isExecutive || isPlanOwner;

  // Executive + Management_BOD = dedicated decision panel mode
  const planIsFinal = plan?.status === 'Achieved' || plan?.status === 'Not Achieved';
  const isExecOnBOD = isExecutive && !planIsFinal && plan?.is_blocked && plan?.attention_level === 'Management_BOD';

  // Permission: who can resolve a blocker? Only via the dedicated Resolve Blocker modal.
  // (Checkbox in comment section has been removed to enforce proper resolution flow.)

  // Auto-focus the executive instruction textarea when modal opens for a critical escalation
  useEffect(() => {
    if (isExecOnBOD && execInstructionRef.current) {
      const timer = setTimeout(() => execInstructionRef.current?.focus(), 400);
      return () => clearTimeout(timer);
    }
  }, [isExecOnBOD]);

  // 3-tier blocker banner theme based on attention_level
  const BLOCKER_THEMES = {
    Management_BOD: {
      bg: 'from-rose-100 to-red-50 border-2 border-rose-500',
      iconBg: 'bg-rose-600 animate-pulse',
      Icon: Megaphone,
      heading: '📢 CRITICAL — MANAGEMENT ATTENTION',
      headingColor: 'text-rose-900',
      subtext: 'This issue requires immediate intervention from Top Management.',
      subtextColor: 'text-rose-700',
      detailBorder: 'border-rose-300',
      detailLabel: 'text-rose-700',
      resolveBtn: 'inline-flex items-center gap-2 px-5 py-2.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors font-semibold text-sm shadow-sm',
      escalateBtn: 'inline-flex items-center gap-2 px-5 py-2.5 bg-white text-rose-700 border-2 border-rose-400 rounded-lg hover:bg-rose-50 transition-colors font-semibold text-sm',
      iconSize: 'w-4 h-4',
    },
    Leader: {
      bg: 'from-red-50 to-orange-50 border-2 border-red-300',
      iconBg: 'bg-red-500',
      Icon: ShieldAlert,
      heading: '🚨 ESCALATED TO LEADER',
      headingColor: 'text-red-800',
      subtext: 'Support requested from Department Leader.',
      subtextColor: 'text-red-600',
      detailBorder: 'border-red-200',
      detailLabel: 'text-red-600',
      resolveBtn: 'inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold text-sm shadow-sm',
      escalateBtn: 'inline-flex items-center gap-2 px-5 py-2.5 bg-white text-red-700 border-2 border-red-300 rounded-lg hover:bg-red-50 transition-colors font-semibold text-sm',
      iconSize: 'w-4 h-4',
    },
    Standard: {
      bg: 'from-amber-50 to-yellow-50 border-2 border-amber-200',
      iconBg: 'bg-amber-400',
      Icon: Hourglass,
      heading: '⏳ BLOCKED — HANDLING INTERNALLY',
      headingColor: 'text-amber-800',
      subtext: 'The PIC is resolving this obstacle independently.',
      subtextColor: 'text-amber-600',
      detailBorder: 'border-amber-200',
      detailLabel: 'text-amber-600',
      resolveBtn: 'inline-flex items-center gap-1.5 px-4 py-2 bg-transparent text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors font-medium text-xs',
      escalateBtn: 'inline-flex items-center gap-1.5 px-4 py-2 bg-transparent text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors font-medium text-xs',
      iconSize: 'w-3.5 h-3.5',
    },
  };
  const blockerTheme = plan ? (BLOCKER_THEMES[plan.attention_level] || BLOCKER_THEMES.Standard) : BLOCKER_THEMES.Standard;

  // Fetch unified timeline (progress logs + audit logs)
  // Re-fetch when plan.updated_at changes (e.g., after ActionPlanModal saves and refreshes the plan)
  useEffect(() => {
    if (plan?.id) {
      fetchUnifiedTimeline();
    }
  }, [plan?.id, plan?.updated_at]);

  const fetchUnifiedTimeline = async () => {
    if (!plan?.id) return;
    setLogsLoading(true);
    try {
      // Fetch BOTH progress_logs AND audit_logs for unified timeline
      const [progressResult, auditResult] = await Promise.all([
        // 1. Fetch progress logs (user comments)
        withTimeout(
          supabase
            .from('progress_logs')
            .select(`id, message, created_at, user_id, profiles:user_id (full_name)`)
            .eq('action_plan_id', plan.id)
            .order('created_at', { ascending: false }),
          8000
        ),
        // 2. Fetch audit logs (system changes) - limit to recent for quick view
        withTimeout(
          supabase
            .from('audit_logs_with_user')
            .select('*')
            .eq('action_plan_id', plan.id)
            .order('created_at', { ascending: false })
            .limit(20), // Limit for performance in quick view
          8000
        )
      ]);

      if (progressResult.error) throw progressResult.error;
      if (auditResult.error) throw auditResult.error;

      // Transform progress logs to match audit log format for unified rendering
      const transformedProgressLogs = (progressResult.data || []).map(log => ({
        id: log.id,
        action_plan_id: plan.id,
        user_id: log.user_id,
        change_type: 'PROGRESS_UPDATE',
        previous_value: null,
        new_value: { message: log.message },
        description: null,
        created_at: log.created_at,
        user_name: log.profiles?.full_name || 'Unknown User',
        message: log.message
      }));

      // Merge both arrays
      const allLogs = [...transformedProgressLogs, ...(auditResult.data || [])];

      // Sort by created_at descending (most recent first)
      allLogs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      setUnifiedTimeline(allLogs);
    } catch (err) {
      console.error('Error fetching unified timeline:', err);
      setUnifiedTimeline([]);
    } finally {
      setLogsLoading(false);
    }
  };

  if (!plan) return null;

  const priorityCode = getPriorityCode(plan.category);
  const priorityColor = priorityCode ? PRIORITY_COLORS[priorityCode] : 'bg-gray-100 text-gray-700 border-gray-200';

  // Revision mode logic
  const isRevisionMode = plan.temporary_unlock_expiry
    && new Date() < new Date(plan.temporary_unlock_expiry)
    && plan.status === 'On Progress'
    && plan.submission_status === 'draft';

  const revisionDaysLeft = isRevisionMode
    ? Math.max(0, Math.ceil((new Date(plan.temporary_unlock_expiry) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;

  const displayStatus = isRevisionMode ? `⏳ Revision: ${revisionDaysLeft}d` : (plan.status || 'Open');
  const statusColor = isRevisionMode ? 'bg-amber-100 text-amber-800 border-amber-200' : (STATUS_COLORS[plan.status] || 'bg-gray-100 text-gray-700');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plan.action_plan || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Post a new progress update (comment only — blocker resolution uses dedicated modal)
  const handlePostUpdate = async () => {
    if (!newMessage.trim()) return;

    setPosting(true);
    try {
      const messageText = newMessage.trim();

      const { data: insertedLog, error: logError } = await supabase
        .from('progress_logs')
        .insert({
          action_plan_id: plan.id,
          user_id: profile.id,
          message: messageText,
          type: 'comment',
        })
        .select('id, created_at')
        .single();

      if (logError) throw logError;

      // Send notifications to @mentioned users + auto-notify PIC (non-blocking)
      try {
        const mentionedIds = extractMentionIds(messageText);
        const planLabel = (plan.action_plan || plan.goal_strategy || 'an action plan').substring(0, 80);
        const senderName = profile.full_name || 'Someone';
        const notificationsToInsert = [];

        // 1. @mention notifications
        if (mentionedIds.length > 0) {
          mentionedIds
            .filter(id => id !== profile.id)
            .forEach(userId => {
              notificationsToInsert.push({
                user_id: userId,
                actor_id: profile.id,
                resource_id: plan.id,
                resource_type: 'ACTION_PLAN',
                type: 'MENTION',
                title: '💬 You were mentioned',
                message: `${senderName} mentioned you in "${planLabel}"`,
              });
            });
        }

        // 2. Auto-notify PIC (plan owner) if commenter is not the PIC
        const picName = (plan.pic || '').trim().toLowerCase();
        const commenterName = (profile.full_name || '').trim().toLowerCase();
        if (picName && picName !== commenterName) {
          // Look up PIC's profile by name to get their user ID
          const { data: picProfiles } = await supabase
            .from('profiles')
            .select('id')
            .ilike('full_name', plan.pic.trim())
            .limit(1);

          const picUserId = picProfiles?.[0]?.id;
          if (picUserId && picUserId !== profile.id) {
            // Only add if PIC wasn't already @mentioned (avoid duplicate)
            const alreadyMentioned = mentionedIds.includes(picUserId);
            if (!alreadyMentioned) {
              const isExecOrAdmin = isExecutive || isAdmin;
              notificationsToInsert.push({
                user_id: picUserId,
                actor_id: profile.id,
                resource_id: plan.id,
                resource_type: 'ACTION_PLAN',
                type: 'NEW_COMMENT',
                title: isExecOrAdmin ? '📢 New Feedback from Management' : '💬 New Comment',
                message: `${senderName} commented on "${planLabel}"`,
              });
            }
          }
        }

        if (notificationsToInsert.length > 0) {
          await supabase.from('notifications').insert(notificationsToInsert);
        }
      } catch (notifErr) {
        console.error('Failed to send notifications:', notifErr);
      }

      // Optimistic UI: prepend the new comment to the timeline instantly
      const optimisticEntry = {
        id: insertedLog?.id || crypto.randomUUID(),
        action_plan_id: plan.id,
        user_id: profile.id,
        change_type: 'PROGRESS_UPDATE',
        previous_value: null,
        new_value: { message: messageText },
        description: null,
        created_at: insertedLog?.created_at || new Date().toISOString(),
        user_name: profile.full_name || 'You',
        message: messageText,
      };
      setUnifiedTimeline(prev => [optimisticEntry, ...prev]);

      // Clear input — modal stays open
      setNewMessage('');

      toast({
        title: 'Update Posted',
        description: 'Your progress update has been recorded.',
        variant: 'success'
      });

    } catch (err) {
      console.error('Failed to post update:', err);
      toast({
        title: 'Post Failed',
        description: err.message || 'Failed to post update',
        variant: 'error'
      });
    } finally {
      setPosting(false);
    }
  };

  // Post executive instruction (from sticky decision panel)
  const handlePostInstruction = async () => {
    if (!execInstruction.trim()) return;

    setPosting(true);
    try {
      const instructionText = `[MANAGEMENT INSTRUCTION] ${execInstruction.trim()}`;

      const { data: insertedLog, error: logError } = await supabase
        .from('progress_logs')
        .insert({
          action_plan_id: plan.id,
          user_id: profile.id,
          message: instructionText,
          type: 'comment',
        })
        .select('id, created_at')
        .single();

      if (logError) throw logError;

      // Dispatch notifications to PIC + department leaders
      try {
        // Find recipients: leaders of this department + PIC (by name match)
        const { data: recipients } = await withTimeout(
          supabase
            .from('profiles')
            .select('id, role, full_name')
            .or(
              `and(role.eq.leader,or(department_code.eq.${plan.department_code},additional_departments.cs.{${plan.department_code}})),` +
              `and(role.eq.staff,department_code.eq.${plan.department_code})`
            ),
          5000
        );

        if (recipients && recipients.length > 0) {
          // Filter: leaders of this dept + staff whose name matches PIC
          const picName = (plan.pic || '').trim().toLowerCase();
          const targetUsers = recipients.filter(r => {
            if (r.id === profile.id) return false; // Don't notify yourself
            if (r.role === 'leader') return true;
            if (r.role === 'staff' && picName && r.full_name?.trim().toLowerCase() === picName) return true;
            return false;
          });

          if (targetUsers.length > 0) {
            const planLabel = (plan.action_plan || plan.goal_strategy || 'an action plan').substring(0, 80);
            const notifications = targetUsers.map(user => ({
              user_id: user.id,
              actor_id: profile.id,
              resource_id: plan.id,
              resource_type: 'ACTION_PLAN',
              type: 'MANAGEMENT_INSTRUCTION',
              title: '📢 Executive Directive',
              message: `Top Management has issued an instruction on "${planLabel}". Action required immediately.`,
            }));

            await supabase.from('notifications').insert(notifications);
          }
        }
      } catch (notifErr) {
        // Non-blocking: don't fail the whole operation if notifications fail
        console.error('Failed to dispatch notifications:', notifErr);
      }

      // Optimistic UI: prepend the instruction to the timeline instantly
      const optimisticEntry = {
        id: insertedLog?.id || crypto.randomUUID(),
        action_plan_id: plan.id,
        user_id: profile.id,
        change_type: 'PROGRESS_UPDATE',
        previous_value: null,
        new_value: { message: instructionText },
        description: null,
        created_at: insertedLog?.created_at || new Date().toISOString(),
        user_name: profile.full_name || 'You',
        message: instructionText,
      };
      setUnifiedTimeline(prev => [optimisticEntry, ...prev]);

      // Clear input — modal stays open
      setExecInstruction('');

      toast({
        title: 'Instruction Sent',
        description: 'Your direction has been recorded and the team has been notified.',
        variant: 'success'
      });
    } catch (err) {
      console.error('Failed to post instruction:', err);
      toast({
        title: 'Post Failed',
        description: err.message || 'Failed to send instruction',
        variant: 'error'
      });
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0 pr-4">
            {/* Top row: Priority + Status Badge (Click-to-Edit) */}
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              {priorityCode && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${priorityColor}`}>
                  {priorityCode}
                </span>
              )}

              {/* Click-to-Edit Status Badge */}
              {canTakeAction && onUpdateStatus ? (
                <button
                  onClick={() => onUpdateStatus(plan)}
                  className={`group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${statusColor} border border-transparent hover:border-gray-300 hover:shadow-sm cursor-pointer`}
                  title={isRevisionMode ? `Revision mode: ${revisionDaysLeft} days left` : "Click to update status"}
                >
                  {displayStatus}
                  <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ) : (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${statusColor}`}>
                  {displayStatus}
                </span>
              )}

              {plan.submission_status === 'submitted' && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium">
                  <Lock className="w-3 h-3" />
                  Submitted
                </span>
              )}
            </div>

            {/* Title */}
            <h2 className="text-lg font-semibold text-gray-800 line-clamp-2">
              {plan.goal_strategy || 'Action Plan Details'}
            </h2>
          </div>

          {/* Header Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Edit Menu */}
            {canTakeAction && onEdit && (
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    side="bottom"
                    align="end"
                    sideOffset={4}
                    className="z-[10000] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[140px] animate-in fade-in-0 zoom-in-95"
                  >
                    <DropdownMenu.Item
                      onClick={() => onEdit(plan)}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer outline-none"
                    >
                      <Edit3 className="w-4 h-4" />
                      Edit Plan Details
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            )}



            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div >
        </div >

        {/* Body Content */}
        < div className="flex-1 overflow-y-auto p-5" >
          {/* BLOCKER BANNER — 3 distinct themes by attention_level (hidden on final statuses) */}
          {
            plan.is_blocked && !planIsFinal && (() => {
              const t = blockerTheme;
              const IconComp = t.Icon;
              return (
                <div className={`mb-6 bg-gradient-to-r ${t.bg} rounded-xl p-5 shadow-sm`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 ${t.iconBg} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <IconComp className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h4 className={`text-lg font-bold ${t.headingColor}`}>{t.heading}</h4>
                      <p className={`text-xs font-medium ${t.subtextColor}`}>{t.subtext}</p>
                    </div>
                  </div>
                  <div className={`bg-white/80 rounded-lg p-4 border ${t.detailBorder} mb-4`}>
                    <span className={`text-xs font-semibold ${t.detailLabel} uppercase tracking-wider block mb-2`}>Blocker Details</span>
                    <p className="text-base font-semibold text-gray-900 leading-relaxed">
                      {plan.blocker_reason || 'No details provided'}
                    </p>
                    {/* Blocked duration indicator */}
                    {(() => {
                      const days = getBlockedDays(plan);
                      const severity = getBlockedSeverity(days);
                      return (
                        <div className="mt-3 space-y-1">
                          <p className={`text-sm font-medium ${severity === 'critical' ? 'text-rose-700' : severity === 'warning' ? 'text-red-600' : 'text-gray-600'}`}>
                            ⏳ This item has been stalled for {days} {days === 1 ? 'day' : 'days'}.
                          </p>
                          {severity === 'critical' && (
                            <p className="text-sm font-bold text-rose-800 bg-rose-100 rounded px-2 py-1 inline-block">
                              ⚠️ SLA BREACH: Immediate Action Required.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  {canTakeAction && (
                    (() => {
                      if (isExecOnBOD) {
                        return (
                          <p className="text-xs text-rose-600 font-medium italic">
                            ℹ️ Use the instruction panel below to provide your direction.
                          </p>
                        );
                      }

                      // Staff cannot resolve BOD-level blockers — only leaders/admins can
                      if (isStaff && plan.attention_level === 'Management_BOD') {
                        return (
                          <div className="flex items-center gap-3 bg-gray-100 rounded-lg px-4 py-3">
                            <Lock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-semibold text-gray-700">Pending Leader Review & Resolution</p>
                              <p className="text-xs text-gray-500 mt-0.5">Only your Department Leader can resolve this critical escalation. Please provide updates via comments below.</p>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div className="flex items-center gap-3 flex-wrap">
                          <button
                            onClick={() => {
                              if (onUpdateStatus) {
                                onUpdateStatus({ ...plan, _prefillStatus: 'On Progress' });
                              }
                            }}
                            className={t.resolveBtn}
                          >
                            <CheckCircle className={t.iconSize} />
                            Resolve Blocker
                          </button>
                          {plan.attention_level !== 'Management_BOD' && (
                            <button
                              onClick={() => onEscalate?.(plan)}
                              className={t.escalateBtn}
                            >
                              <ArrowUpCircle className={t.iconSize} />
                              Escalate
                            </button>
                          )}
                        </div>
                      );
                    })()
                  )}
                </div>
              );
            })()
          }

          {/* Two Column Grid - Metadata & Strategic Context */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Metadata</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center"><Building2 className="w-4 h-4 text-teal-600" /></div>
                  <div><p className="text-xs text-gray-500">Department</p><p className="text-sm font-medium text-gray-800">{plan.department_code || '—'}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center"><Calendar className="w-4 h-4 text-blue-600" /></div>
                  <div><p className="text-xs text-gray-500">Month</p><p className="text-sm font-medium text-gray-800">{plan.month || '—'}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center"><User className="w-4 h-4 text-purple-600" /></div>
                  <div><p className="text-xs text-gray-500">Person In Charge</p><p className="text-sm font-medium text-gray-800">{plan.pic || '—'}</p></div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Strategic Context</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center"><Target className="w-4 h-4 text-emerald-600" /></div>
                  <div><p className="text-xs text-gray-500">Focus Area</p><p className="text-sm font-medium text-gray-800">{plan.area_focus || '—'}</p></div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center"><Sparkles className="w-4 h-4 text-amber-600" /></div>
                  <div><p className="text-xs text-gray-500">Goal / Strategy</p><p className="text-sm font-medium text-gray-800 line-clamp-3">{plan.goal_strategy || '—'}</p></div>
                </div>
              </div>
            </div>
          </div>

          {/* Carry-Over Warning Banner */}
          {
            plan.carry_over_status && plan.carry_over_status !== 'Normal' && (
              <div className={`rounded-xl p-4 border mb-4 flex items-center gap-3 ${plan.carry_over_status === 'Late_Month_2'
                ? 'bg-rose-50 border-rose-200'
                : 'bg-amber-50 border-amber-200'
                }`}>
                <span className="text-lg flex-shrink-0">{plan.carry_over_status === 'Late_Month_2' ? '🔥' : '↩️'}</span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${plan.carry_over_status === 'Late_Month_2' ? 'text-rose-800' : 'text-amber-800'}`}>
                    {plan.carry_over_status === 'Late_Month_2' ? 'CRITICAL LATE — 2nd Carry Over' : 'LATE — 1st Carry Over'}
                  </p>
                  <p className={`text-xs mt-0.5 ${plan.carry_over_status === 'Late_Month_2' ? 'text-rose-600' : 'text-amber-600'}`}>
                    Max achievable score capped at {plan.max_possible_score ?? (plan.carry_over_status === 'Late_Month_2' ? 50 : 80)}%.
                    {plan.carry_over_status === 'Late_Month_2' && ' Must be resolved this month — no further carry-over allowed.'}
                  </p>
                </div>
              </div>
            )
          }

          {/* Action Plan */}
          <div className="bg-teal-50 rounded-xl p-5 border border-teal-100 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                <h3 className="text-xs font-semibold text-teal-700 uppercase tracking-wider">Action Plan</h3>
              </div>
              <button onClick={handleCopy} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${copied ? 'bg-green-100 text-green-700' : 'bg-white text-gray-600 hover:bg-teal-100 hover:text-teal-700 border border-teal-200'}`}>
                {copied ? <><Check className="w-3.5 h-3.5" />Copied!</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
              </button>
            </div>
            <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">{plan.action_plan || 'No action plan description provided.'}</p>
          </div>

          {/* KPI/Indicator */}
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-100 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Flag className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wider">KPI / Indicator</h3>
            </div>
            <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">{plan.indicator || 'No indicator specified.'}</p>
          </div>

          {/* Execution Results (Compact) */}
          {
            (plan.quality_score != null || plan.evidence || plan.outcome_link || (Array.isArray(plan.attachments) && plan.attachments.length > 0) || plan.admin_feedback || plan.status === 'Not Achieved') && (
              <div className="mb-4 p-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="w-4 h-4 text-gray-600" />
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Results & Evidence</h3>
                </div>
                <div className="space-y-3">
                  {plan.quality_score != null && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Verification Score:</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm font-bold ${plan.quality_score >= 80 ? 'bg-green-500 text-white' : plan.quality_score >= 60 ? 'bg-amber-500 text-white' : 'bg-red-500 text-white'}`}>
                        <Star className="w-3 h-3" />{plan.quality_score}
                      </span>
                    </div>
                  )}
                  {plan.status === 'Not Achieved' && plan.gap_category && (
                    <div className="bg-red-50 rounded-lg p-3 border border-red-100">
                      <span className="text-xs font-medium text-red-600">Root Cause: </span>
                      <span className="text-sm text-gray-800">{plan.gap_category === 'Other' && plan.specify_reason ? `Other: ${plan.specify_reason}` : plan.gap_category}</span>
                      {plan.gap_analysis && <p className="text-sm text-gray-600 mt-1 italic">"{plan.gap_analysis}"</p>}
                    </div>
                  )}

                  {/* Multi-Attachment Evidence List */}
                  {Array.isArray(plan.attachments) && plan.attachments.length > 0 ? (
                    <div>
                      <span className="text-xs text-gray-500 block mb-2">Evidence Attachments ({plan.attachments.length})</span>
                      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 bg-white overflow-hidden">
                        {plan.attachments.map((item, idx) => (
                          <a
                            key={idx}
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors group"
                          >
                            {getAttachmentIcon(item)}
                            <span className="flex-1 min-w-0 text-sm text-gray-800 font-medium truncate group-hover:text-blue-600 transition-colors">
                              {item.name || item.title || item.url}
                            </span>
                            {item.type === 'file' && item.size && (
                              <span className="text-xs text-gray-400 flex-shrink-0">{formatFileSize(item.size)}</span>
                            )}
                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${item.type === 'file' ? 'bg-gray-100 text-gray-500' : 'bg-indigo-50 text-indigo-500'
                              }`}>
                              {item.type}
                            </span>
                            <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-500 flex-shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  ) : plan.outcome_link ? (
                    /* Legacy Fallback: Single outcome_link */
                    <div>
                      <span className="text-xs text-gray-500 block mb-1">Proof of Evidence</span>
                      {isUrl(plan.outcome_link) ? (
                        <a href={plan.outcome_link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium">
                          <ExternalLink className="w-3.5 h-3.5" />View Evidence
                        </a>
                      ) : (
                        <p className="text-sm text-gray-700">{plan.outcome_link}</p>
                      )}
                    </div>
                  ) : null}

                  {plan.admin_feedback && (
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                      <span className="text-xs font-medium text-amber-700">Review Note: </span>
                      <span className="text-sm text-amber-900 italic">"{plan.admin_feedback}"</span>
                    </div>
                  )}
                </div>
              </div>
            )
          }

          {/* Activity Section - Trello Style */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            {/* 1. Header Area - Trello Style */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <List className="w-5 h-5 text-gray-500" />
                <h3 className="font-semibold text-gray-700">Activity</h3>
                {unifiedTimeline.length > 0 && (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">
                    {unifiedTimeline.length}
                  </span>
                )}
              </div>
            </div>

            {/* 2. Input Area - Clean, distinct section */}
            {canComment && !isExecOnBOD && (
              <div className="mb-6">
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <MentionInput
                    value={newMessage}
                    onChange={setNewMessage}
                    placeholder="Write a comment... Use @ to mention someone"
                    rows={2}
                    disabled={posting}
                    inputRef={commentRef}
                  />

                  <div className="flex justify-end mt-3">
                    <button
                      onClick={handlePostUpdate}
                      disabled={!newMessage.trim() || posting}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. The Stream - Activity Feed */}
            <div className="max-h-[350px] overflow-y-auto">
              {logsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  <span className="ml-2 text-sm text-gray-500">Loading activity...</span>
                </div>
              ) : (
                <SharedHistoryTimeline
                  items={unifiedTimeline}
                  accentColor="gray"
                  emptyMessage="No activity yet"
                  emptySubMessage="Write a comment to start the conversation"
                  EmptyIcon={List}
                />
              )}
            </div>
          </div>
        </div >

        {/* Footer — Executive Decision Panel OR standard Close button */}
        {
          isExecOnBOD ? (
            <div className="border-t-2 border-slate-300 bg-slate-50 rounded-b-xl p-5 flex-shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 bg-slate-700 rounded-lg flex items-center justify-center">
                  <Pencil className="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Executive Instruction / Direction</h4>
                  <p className="text-xs text-slate-500">Your decision will be sent to the Department Leader for execution.</p>
                </div>
              </div>
              <textarea
                ref={execInstructionRef}
                value={execInstruction}
                onChange={(e) => setExecInstruction(e.target.value)}
                placeholder="e.g. Approved — proceed with vendor replacement. Budget cap: $5,000. Report back by Friday."
                rows={3}
                disabled={posting}
                className="w-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent disabled:bg-gray-100 placeholder:text-slate-400"
              />
              <div className="flex items-center justify-between mt-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 transition-colors font-medium"
                >
                  Close
                </button>
                <button
                  onClick={handlePostInstruction}
                  disabled={!execInstruction.trim() || posting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Instruction
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          )
        }
      </div >
    </div >
  );
}
