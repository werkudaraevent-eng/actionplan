import { User, Clock } from 'lucide-react';
import MentionText from '../common/MentionText';

/**
 * SharedHistoryTimeline - Unified timeline component for displaying history
 * 
 * Used by both HistoryModal (audit_logs) and ActionPlanProgressModal (progress_logs)
 * to ensure consistent visualization across the app.
 * 
 * Design: User's note/message first (narrative), then system metadata (pills/badges) as footer
 */

// Change type labels and styling for audit logs
export const CHANGE_TYPE_LABELS = {
  'SUBMITTED_FOR_REVIEW': { label: 'Submitted to Admin', color: 'bg-blue-100 text-blue-700', icon: '📤' },
  'MARKED_READY': { label: 'Marked Ready for Leader', color: 'bg-purple-100 text-purple-700', icon: '✅' },
  'STATUS_UPDATE': { label: 'Status Changed', color: 'bg-amber-100 text-amber-700', icon: '🔄' },
  'REMARK_UPDATE': { label: 'Remark Updated', color: 'bg-purple-100 text-purple-700', icon: '📝' },
  'OUTCOME_UPDATE': { label: 'Proof of Evidence Updated', color: 'bg-teal-100 text-teal-700', icon: '🔗' },
  'FULL_UPDATE': { label: 'Record Updated', color: 'bg-gray-100 text-gray-600', icon: '✏️' },
  'CREATED': { label: 'Created', color: 'bg-green-100 text-green-700', icon: '➕' },
  'DELETED': { label: 'Deleted', color: 'bg-red-100 text-red-700', icon: '🗑️' },
  'SOFT_DELETE': { label: 'Moved to Trash', color: 'bg-red-100 text-red-700', icon: '🗑️' },
  'RESTORE': { label: 'Restored', color: 'bg-green-100 text-green-700', icon: '♻️' },
  'APPROVED': { label: 'Approved & Graded', color: 'bg-green-100 text-green-700', icon: '✅' },
  'REJECTED': { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: '❌' },
  'REVISION_REQUESTED': { label: '↩️ Revision Requested', color: 'bg-amber-100 text-amber-700', icon: '↩️' },
  'LEADER_BATCH_SUBMIT': { label: 'Leader Submitted to Admin', color: 'bg-blue-100 text-blue-700', icon: '📤' },
  'GRADE_RESET': { label: 'Assessment Cleared', color: 'bg-orange-100 text-orange-700', icon: '🔄' },
  'UNLOCK_REQUESTED': { label: 'Unlock Requested', color: 'bg-amber-100 text-amber-700', icon: '🔓' },
  'UNLOCK_APPROVED': { label: 'Unlock Approved', color: 'bg-green-100 text-green-700', icon: '✅' },
  'UNLOCK_REJECTED': { label: 'Unlock Rejected', color: 'bg-red-100 text-red-700', icon: '❌' },
  'ALERT_RAISED': { label: '🚨 Escalation Raised', color: 'bg-orange-100 text-orange-700', icon: '🚨' },
  'BLOCKER_UPDATED': { label: 'Blocker Updated', color: 'bg-orange-100 text-orange-700', icon: '⚠️' },
  'BLOCKER_REPORTED': { label: 'Blocker Reported', color: 'bg-amber-100 text-amber-700', icon: '✋' },
  'BLOCKER_CLEARED': { label: 'Blocker Cleared', color: 'bg-emerald-100 text-emerald-700', icon: '✅' },
  'CARRY_OVER': { label: 'Carried Over', color: 'bg-blue-100 text-blue-700', icon: '⏭️' },
  'ESCALATION_CHANGE': { label: 'Escalation Changed', color: 'bg-orange-100 text-orange-700', icon: '⬆️' },
  'RESCHEDULED': { label: 'Rescheduled', color: 'bg-indigo-100 text-indigo-700', icon: '📅' },
  'PLAN_DETAILS_UPDATED': { label: 'Plan Details Updated', color: 'bg-gray-100 text-gray-600', icon: '✏️' },
  // Progress log type (for unified display)
  'PROGRESS_UPDATE': { label: 'Progress Update', color: 'bg-blue-100 text-blue-700', icon: '💬' },
};

// Format date helper - Precise timestamp for audit trails
// Format: "Feb 05, 2026 • 11:57"
export function formatDate(dateString) {
  const date = new Date(dateString);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${month} ${day}, ${year} • ${hours}:${minutes}`;
}

// Format precise timestamp (same as formatDate - for audit trail precision)
export function formatPreciseTimestamp(dateString) {
  return formatDate(dateString);
}

// Legacy: Format relative time (kept for backward compatibility but not used in timeline)
export function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  return formatDate(dateString);
}

// Check if a progress update message is a system-generated tag (should be filtered out)
// These are already represented by prettier System Log cards
// NOTE: We keep [BLOCKER RESOLVED] because it contains the user's resolution note
function isSystemTaggedProgressUpdate(message) {
  if (!message) return false;

  // Only filter out tags that are purely system-generated with no user content
  // [BLOCKER RESOLVED] contains user's resolution note, so we keep it but clean the prefix
  const systemTags = [
    /^\[BLOCKER REPORTED\]/i,
    /^\[STATUS CHANGED\]/i,
    /^\[ALERT RAISED\]/i,
    /^\[CARRY OVER\]/i,
    /^\[GRADE RESET\]/i,
    /^\[SUBMITTED\]/i,
  ];

  return systemTags.some(pattern => pattern.test(message));
}

// Parse description - could be JSON array or plain string
// Also filters out hardcoded trigger messages to prioritize real user notes
function parseDescription(description) {
  if (!description) return [];

  // List of hardcoded trigger messages to filter out (these are not user-provided)
  const hardcodedPatterns = [
    /^✅ BLOCKER CLEARED: Issue marked as resolved/i,
    /^✋ BLOCKER REPORTED:/i,
    /^🚨 ALERT RAISED:/i,
    /^⏭️ CARRY OVER:/i,
    // Filter out noise about remark being cleared/updated when it's just system cleanup
    /Updated Remark:.*Cleared/i,
    /Updated Remark:.*null/i,
    /Remark.*cleared/i,
  ];

  try {
    const parsed = typeof description === 'string' ? JSON.parse(description) : description;
    if (Array.isArray(parsed)) {
      // Filter out hardcoded messages from array
      return parsed.filter(item =>
        !hardcodedPatterns.some(pattern => pattern.test(item))
      );
    }
    // Check if single string is hardcoded
    if (hardcodedPatterns.some(pattern => pattern.test(description))) {
      return [];
    }
    return [description];
  } catch {
    // Check if single string is hardcoded
    if (hardcodedPatterns.some(pattern => pattern.test(description))) {
      return [];
    }
    return [description];
  }
}

/**
 * Extract user's actual note from audit log item
 * Prioritizes real user input over hardcoded trigger messages
 * Cleans up system prefixes like [BLOCKER RESOLVED] to show only the user's note
 */
function extractUserNote(item) {
  // Priority 1: message field (from progress_logs)
  if (item.message) {
    // Clean up system prefixes to extract the actual user note
    const cleanMessage = item.message
      .replace(/^\[BLOCKER RESOLVED\]\s*/i, '')
      .replace(/^\[BLOCKER REPORTED\]\s*/i, '')
      .replace(/→\s*Status:\s*\w+\s*$/i, '') // Remove "→ Status: Achieved" suffix
      .trim();
    if (cleanMessage) return cleanMessage;
  }

  // Priority 2: new_value.remark (user's note saved to remark field)
  const remark = item.new_value?.remark;
  if (remark) {
    // Clean up prefixes like [Blocker Resolved], [Cause: ...], etc.
    const cleanRemark = remark
      .replace(/^\[Blocker Resolved\]\s*/i, '')
      .replace(/^\[Cause: [^\]]+\]\s*/i, '')
      .trim();
    if (cleanRemark) return cleanRemark;
  }

  // Priority 3: new_value.blocker_reason (for blocker reported events)
  if (item.new_value?.blocker_reason && item.change_type === 'BLOCKER_REPORTED') {
    return item.new_value.blocker_reason;
  }

  // Priority 4: new_value.admin_feedback (for revision requests)
  if (item.new_value?.admin_feedback) {
    return item.new_value.admin_feedback;
  }

  // Priority 5: new_value.unlock_reason (for unlock requests)
  if (item.new_value?.unlock_reason) {
    return item.new_value.unlock_reason;
  }

  return null;
}

/**
 * TimelineItem - Single item in the timeline
 */
function TimelineItem({ item, index, isFirst, accentColor = 'teal' }) {
  const typeInfo = CHANGE_TYPE_LABELS[item.change_type] || {
    label: item.change_type || 'Update',
    color: 'bg-gray-100 text-gray-700'
  };

  // Extract the user's actual note (prioritizes real user input over hardcoded messages)
  const userNote = extractUserNote(item);
  const descriptionItems = parseDescription(item.description); // Filtered audit log descriptions

  // Accent colors based on prop
  const dotColor = isFirst ? `bg-${accentColor}-500` : 'bg-gray-300';
  const cardBorder = isFirst ? `border-${accentColor}-200` : 'border-gray-100';
  const cardBg = isFirst ? `bg-${accentColor}-50/50` : 'bg-gray-50';

  return (
    <div className="relative pl-10">
      {/* Timeline dot */}
      <div className={`absolute left-2 top-2 w-4 h-4 rounded-full border-2 border-white shadow ${isFirst ? 'bg-teal-500' : 'bg-gray-300'
        }`} />

      {/* Content card */}
      <div className={`rounded-lg p-4 border ${isFirst ? 'border-teal-200 bg-teal-50/30' : 'border-gray-100 bg-gray-50'}`}>
        {/* User info & timestamp header */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <User className="w-3.5 h-3.5" />
            <span className="font-medium text-gray-700">
              {item.user_name || item.profiles?.full_name || 'Unknown User'}
            </span>
            {item.user_department && (
              <>
                <span className="text-gray-300">•</span>
                <span>{item.user_department}</span>
              </>
            )}
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {formatDate(item.created_at)}
          </span>
        </div>

        {/* PRIMARY: User's Note/Message (narrative context) */}
        {userNote && (
          <p className={`text-sm leading-relaxed mb-3 ${isFirst ? 'text-gray-800' : 'text-gray-600'}`}>
            <MentionText text={userNote} />
          </p>
        )}

        {/* Description from audit logs (if no user note) */}
        {!userNote && descriptionItems.length > 0 && (
          descriptionItems.length === 1 ? (
            <p className="text-sm text-gray-700 mb-3 whitespace-pre-line">{descriptionItems[0]}</p>
          ) : (
            <ul className="text-sm text-gray-700 mb-3 space-y-1">
              {descriptionItems.map((desc, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-teal-500 mt-1">•</span>
                  <span>{desc}</span>
                </li>
              ))}
            </ul>
          )
        )}

        {/* SECONDARY: System Metadata (pills, badges) as subtle footer */}
        <div className="pt-2 border-t border-gray-100 space-y-2">
          {/* Change type pill */}
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeInfo.color}`}>
              {typeInfo.label}
            </span>

            {/* Latest badge for first item */}
            {isFirst && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-teal-100 text-teal-700 rounded text-xs font-medium">
                <Clock className="w-3 h-3" />
                Latest
              </span>
            )}
          </div>

          {/* Status transition pills */}
          {(item.change_type === 'STATUS_UPDATE' ||
            item.change_type === 'REVISION_REQUESTED' ||
            item.change_type === 'APPROVED' ||
            item.change_type === 'GRADE_RESET') && item.previous_value && (
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                  {item.previous_value.status || item.previous_value.submission_status || 'Unknown'}
                </span>
                <span className="text-gray-400">→</span>
                <span className={`px-2 py-0.5 rounded ${item.change_type === 'REVISION_REQUESTED'
                  ? 'bg-amber-100 text-amber-700'
                  : item.change_type === 'APPROVED'
                    ? 'bg-green-100 text-green-700'
                    : item.change_type === 'GRADE_RESET'
                      ? 'bg-orange-100 text-orange-700'
                      : item.new_value?.status === 'Not Achieved'
                        ? 'bg-red-100 text-red-700'
                        : item.new_value?.status === 'Achieved'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-teal-100 text-teal-700'
                  }`}>
                  {item.new_value?.status || item.new_value?.submission_status || 'Unknown'}
                </span>
              </div>
            )}

          {/* Escalation transition pills */}
          {item.change_type === 'ESCALATION_CHANGE' && item.previous_value && item.new_value && (
            <div className="flex items-center gap-2 text-xs">
              <span className={`px-2 py-0.5 rounded ${item.previous_value.attention_level === 'Management_BOD' ? 'bg-red-100 text-red-700' :
                item.previous_value.attention_level === 'Leader' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-200 text-gray-600'
                }`}>
                {item.previous_value.attention_level === 'Management_BOD' ? 'Management/BOD' :
                  item.previous_value.attention_level === 'Leader' ? 'Leader' :
                    item.previous_value.attention_level || 'Standard'}
              </span>
              <span className="text-gray-400">→</span>
              <span className={`px-2 py-0.5 rounded ${item.new_value.attention_level === 'Management_BOD' ? 'bg-red-100 text-red-700' :
                item.new_value.attention_level === 'Leader' ? 'bg-amber-100 text-amber-700' :
                  'bg-gray-200 text-gray-600'
                }`}>
                {item.new_value.attention_level === 'Management_BOD' ? 'Management/BOD' :
                  item.new_value.attention_level === 'Leader' ? 'Leader' :
                    item.new_value.attention_level || 'Standard'}
              </span>
            </div>
          )}

          {/* RCA (Root Cause Analysis) Details - For "Not Achieved" status changes */}
          {item.change_type === 'STATUS_UPDATE' && item.new_value?.status === 'Not Achieved' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-2">
              <div className="flex items-center gap-2 text-red-800 font-semibold">
                <span>📋 Failure Analysis</span>
              </div>

              {/* Reason for Non-Achievement */}
              {(item.new_value?.gap_category || item.new_value?.specify_reason) && (
                <div>
                  <span className="font-medium text-red-700">Reason: </span>
                  <span className="text-red-600">
                    {item.new_value.gap_category === 'Other' && item.new_value.specify_reason
                      ? `Other: ${item.new_value.specify_reason}`
                      : item.new_value.gap_category || 'Not specified'}
                  </span>
                </div>
              )}

              {/* Failure Details / Gap Analysis */}
              {item.new_value?.gap_analysis && (
                <div>
                  <span className="font-medium text-red-700">Details: </span>
                  <span className="text-red-600">"{item.new_value.gap_analysis}"</span>
                </div>
              )}

              {/* Fallback if no RCA data captured (legacy entries) */}
              {!item.new_value?.gap_category && !item.new_value?.gap_analysis && (
                <div className="text-red-500 italic">
                  No failure analysis recorded (legacy entry)
                </div>
              )}
            </div>
          )}

          {/* Score for approvals */}
          {item.change_type === 'APPROVED' && item.new_value?.quality_score != null && (
            <div className="text-xs text-gray-600">
              Verification Score: <span className="font-bold text-green-600">{item.new_value.quality_score}%</span>
            </div>
          )}

          {/* Cleared score for grade resets */}
          {item.change_type === 'GRADE_RESET' && item.previous_value?.quality_score != null && (
            <div className="p-2 bg-orange-50 border border-orange-200 rounded text-xs">
              <span className="font-medium text-orange-800">Previous Score Cleared: </span>
              <span className="text-orange-700 line-through">{item.previous_value.quality_score}%</span>
              <span className="text-orange-600 ml-2">→ Reset to Open</span>
            </div>
          )}

          {/* Feedback for revision requests */}
          {item.change_type === 'REVISION_REQUESTED' && item.new_value?.admin_feedback && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs">
              <span className="font-medium text-amber-800">Feedback: </span>
              <span className="text-amber-700">"{item.new_value.admin_feedback}"</span>
            </div>
          )}

          {/* Escalation/Blocker details */}
          {(item.change_type === 'ALERT_RAISED' || item.change_type === 'BLOCKER_UPDATED' || item.change_type === 'BLOCKER_REPORTED') && item.new_value && (
            <>
              {item.change_type === 'ALERT_RAISED' && item.previous_value?.status && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                    {item.previous_value.status}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                    🚨 Escalated
                  </span>
                </div>
              )}
              {item.new_value.blocker_reason && (
                <div className="p-2 bg-orange-50 border border-orange-200 rounded text-xs">
                  <span className="font-medium text-orange-800">Blocker: </span>
                  <span className="text-orange-700">"{item.new_value.blocker_reason}"</span>
                </div>
              )}
            </>
          )}

          {/* Blocker cleared details - Show the user's resolution note */}
          {item.change_type === 'BLOCKER_CLEARED' && (
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded text-xs">
              {(() => {
                // The resolution note should already be in userNote (extracted at top of TimelineItem)
                // But we also check various fallback sources

                // Priority 1: Use the userNote already extracted (from remark, message, etc.)
                // This is already displayed above, so we just show a simple confirmation here
                // unless there's no userNote, then we try other sources

                // Priority 2: Check new_value.gap_analysis or new_value.remark for resolution details
                const remarkNote = item.new_value?.remark;
                const cleanRemark = remarkNote?.replace(/^\[Blocker Resolved\]\s*/i, '').trim();

                // Priority 3: Check description for actual user content (not hardcoded messages)
                const descNote = item.description &&
                  !item.description.includes('Issue marked as resolved') &&
                  !item.description.includes('BLOCKER CLEARED:') &&
                  !item.description.startsWith('✅')
                  ? item.description
                  : null;

                // If userNote is already shown above, just show simple confirmation
                if (userNote) {
                  return <span className="font-medium text-emerald-800">✅ Blocker resolved</span>;
                } else if (cleanRemark) {
                  return (
                    <>
                      <span className="font-medium text-emerald-800">Resolution: </span>
                      <span className="text-emerald-700">"{cleanRemark}"</span>
                    </>
                  );
                } else if (descNote) {
                  return (
                    <>
                      <span className="font-medium text-emerald-800">Resolution: </span>
                      <span className="text-emerald-700">"{descNote}"</span>
                    </>
                  );
                } else {
                  // Fallback: Just show confirmation without the old blocker reason
                  return <span className="font-medium text-emerald-800">✅ Blocker marked as resolved</span>;
                }
              })()}
            </div>
          )}

          {/* Carry Over details */}
          {item.change_type === 'CARRY_OVER' && item.new_value && (
            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs">
              <span className="font-medium text-blue-800">⏭️ Carried to: </span>
              <span className="text-blue-700">{item.new_value.month} {item.new_value.year}</span>
              <span className="text-blue-500 ml-2">• Status reset to Open</span>
            </div>
          )}

          {/* Rescheduled (month change) details */}
          {item.change_type === 'RESCHEDULED' && item.previous_value && item.new_value && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded">
                {item.previous_value.month}{item.previous_value.year !== item.new_value.year ? ` ${item.previous_value.year}` : ''}
              </span>
              <span className="text-gray-400">→</span>
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">
                {item.new_value.month} {item.new_value.year}
              </span>
            </div>
          )}

          {/* Unlock request details */}
          {item.change_type === 'UNLOCK_REQUESTED' && item.new_value && (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 bg-gray-200 text-gray-600 rounded">Locked</span>
                <span className="text-gray-400">→</span>
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Pending Approval</span>
              </div>
              {item.new_value.unlock_reason && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                  <span className="font-medium text-amber-800">Reason: </span>
                  <span className="text-amber-700">"{item.new_value.unlock_reason}"</span>
                </div>
              )}
            </>
          )}

          {/* Unlock approval details */}
          {item.change_type === 'UNLOCK_APPROVED' && item.new_value && (
            <>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Pending</span>
                <span className="text-gray-400">→</span>
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">Approved</span>
              </div>
              {item.new_value.approved_until && (
                <div className="p-2 bg-green-50 border border-green-200 rounded text-xs">
                  <span className="font-medium text-green-800">Editable until: </span>
                  <span className="text-green-700">{new Date(item.new_value.approved_until).toLocaleDateString()}</span>
                </div>
              )}
            </>
          )}

          {/* Unlock rejection details */}
          {item.change_type === 'UNLOCK_REJECTED' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded">Pending</span>
              <span className="text-gray-400">→</span>
              <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded">Rejected</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * SharedHistoryTimeline - Main timeline component
 * 
 * @param {Array} items - Array of history items (audit_logs or progress_logs)
 * @param {string} accentColor - Accent color for the timeline (default: 'teal')
 * @param {string} emptyMessage - Message to show when no items
 * @param {string} emptySubMessage - Sub-message for empty state
 */
export default function SharedHistoryTimeline({
  items = [],
  accentColor = 'teal',
  emptyMessage = 'No history yet',
  emptySubMessage = 'Changes will appear here when updates are made',
  EmptyIcon = Clock
}) {
  // Filter out duplicate progress updates that are system-tagged
  // These are already represented by prettier System Log cards (BLOCKER_REPORTED, etc.)
  const filteredItems = items.filter(item => {
    // Keep all non-progress-update items
    if (item.change_type !== 'PROGRESS_UPDATE') return true;

    // For progress updates, filter out system-tagged ones
    const message = item.message || item.new_value?.message;
    return !isSystemTaggedProgressUpdate(message);
  });

  if (filteredItems.length === 0) {
    return (
      <div className="text-center py-12">
        <EmptyIcon className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">{emptyMessage}</p>
        <p className="text-sm text-gray-400 mt-1">{emptySubMessage}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-4 top-2 bottom-2 w-0.5 bg-gray-200" />

      {/* Timeline items */}
      <div className="space-y-4">
        {filteredItems.map((item, index) => (
          <TimelineItem
            key={item.id}
            item={item}
            index={index}
            isFirst={index === 0}
            accentColor={accentColor}
          />
        ))}
      </div>
    </div>
  );
}
