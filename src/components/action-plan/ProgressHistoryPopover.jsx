import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, Clock, User, Loader2, ChevronDown, X } from 'lucide-react';
import { supabase, withTimeout } from '../../lib/supabase';

/**
 * ProgressHistoryPopover - Clickable popover showing progress history timeline
 * 
 * Shows the 3 most recent progress logs for an action plan.
 * Displays as a mini-timeline with newest first.
 * 
 * Uses React Portal to render outside table DOM tree, avoiding overflow clipping.
 */
export default function ProgressHistoryPopover({ actionPlanId, hasLogs = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        popoverRef.current && 
        !popoverRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Calculate popover position when opening
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverHeight = 280; // Approximate max height
      
      // Position above trigger by default, but flip below if not enough space
      let top = rect.top - popoverHeight - 8;
      if (top < 10) {
        // Not enough space above, position below
        top = rect.bottom + 8;
      }
      
      // Ensure left position doesn't overflow viewport
      let left = rect.left;
      const popoverWidth = 288; // w-72 = 18rem = 288px
      if (left + popoverWidth > window.innerWidth - 10) {
        left = window.innerWidth - popoverWidth - 10;
      }
      if (left < 10) left = 10;
      
      setPopoverPosition({ top, left });
    }
  }, [isOpen]);

  // Close on scroll (table might scroll away from popover)
  useEffect(() => {
    if (!isOpen) return;
    
    const handleScroll = () => {
      setIsOpen(false);
    };
    
    // Listen to scroll on window and any scrollable parent
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [isOpen]);

  // Fetch logs when popover opens
  useEffect(() => {
    if (isOpen && actionPlanId && logs.length === 0) {
      fetchLogs();
    }
  }, [isOpen, actionPlanId]);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await withTimeout(
        supabase
          .from('progress_logs')
          .select(`
            id,
            message,
            created_at,
            user_id,
            profiles:user_id (
              full_name
            )
          `)
          .eq('action_plan_id', actionPlanId)
          .order('created_at', { ascending: false })
          .limit(3),
        5000
      );

      if (fetchError) throw fetchError;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching progress logs:', err);
      setError('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleToggle = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  // Don't render if no logs exist
  if (!hasLogs) return null;

  // Popover content - rendered via portal
  const popoverContent = isOpen ? createPortal(
    <div 
      ref={popoverRef}
      className="fixed w-72 bg-white rounded-xl shadow-2xl border border-gray-200 z-[9990] overflow-hidden"
      style={{ top: popoverPosition.top, left: popoverPosition.left }}
    >
      {/* Header */}
      <div className="bg-blue-600 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-white/80" />
          <span className="text-sm font-semibold text-white">Progress History</span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
          className="text-white/70 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-3 max-h-64 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-4">
            <p className="text-xs text-red-500">{error}</p>
            <button
              onClick={(e) => {
                e.stopPropagation();
                fetchLogs();
              }}
              className="mt-2 text-xs text-blue-600 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-4">
            <MessageSquare className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-500">No progress updates yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log, index) => (
              <div
                key={log.id}
                className={`relative pl-4 ${
                  index === 0 ? 'border-l-2 border-blue-500' : 'border-l-2 border-gray-200'
                }`}
              >
                {/* Timeline dot */}
                <div
                  className={`absolute -left-[5px] top-0 w-2 h-2 rounded-full ${
                    index === 0 ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                />

                {/* Content */}
                <div className={index === 0 ? '' : 'opacity-70'}>
                  {/* Date & User */}
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] text-gray-500 font-medium">
                      {formatDate(log.created_at)}
                    </span>
                    {log.profiles?.full_name && (
                      <>
                        <span className="text-gray-300">•</span>
                        <span className="text-[10px] text-gray-500 flex items-center gap-1">
                          <User className="w-2.5 h-2.5" />
                          {log.profiles.full_name}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Message */}
                  <p
                    className={`text-xs leading-relaxed ${
                      index === 0 ? 'text-gray-800 font-medium' : 'text-gray-600'
                    }`}
                  >
                    {log.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {logs.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
          <p className="text-[10px] text-gray-400 text-center">
            Showing {logs.length} most recent • Click row for full history
          </p>
        </div>
      )}
    </div>,
    document.body
  ) : null;

  return (
    <div className="relative">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all ${
          isOpen
            ? 'bg-blue-600 text-white'
            : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
        }`}
        title="View progress history"
      >
        <MessageSquare className="w-3 h-3" />
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Popover rendered via portal */}
      {popoverContent}
    </div>
  );
}
