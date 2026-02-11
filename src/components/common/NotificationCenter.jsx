import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import * as Popover from '@radix-ui/react-popover';
import * as Tabs from '@radix-ui/react-tabs';
import { 
  Bell, 
  MessageSquare, 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Star, 
  Unlock, 
  Lock,
  ArrowRight,
  Check,
  Loader2,
  Inbox,
  AtSign,
  Megaphone
} from 'lucide-react';
import { supabase, withTimeout } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

// Notification type icons and colors
const NOTIFICATION_CONFIG = {
  NEW_COMMENT: { 
    icon: MessageSquare, 
    color: 'text-blue-500', 
    bgColor: 'bg-blue-100',
    label: 'Comment',
    tier: 'standard',
  },
  MENTION: { 
    icon: AtSign, 
    color: 'text-purple-500', 
    bgColor: 'bg-purple-100',
    label: 'Mention',
    tier: 'standard',
  },
  STATUS_CHANGE: { 
    icon: ArrowRight, 
    color: 'text-amber-500', 
    bgColor: 'bg-amber-100',
    label: 'Status Update',
    tier: 'standard',
  },
  KICKBACK: { 
    icon: XCircle, 
    color: 'text-red-500', 
    bgColor: 'bg-red-100',
    label: 'Kickback',
    tier: 'urgent',
  },
  BLOCKER_REPORTED: { 
    icon: AlertTriangle, 
    color: 'text-rose-600', 
    bgColor: 'bg-rose-100',
    label: 'Blocker Reported',
    tier: 'urgent',
  },
  BLOCKER_RESOLVED: { 
    icon: CheckCircle, 
    color: 'text-emerald-500', 
    bgColor: 'bg-emerald-100',
    label: 'Blocker Resolved',
    tier: 'standard',
  },
  GRADE_RECEIVED: { 
    icon: Star, 
    color: 'text-yellow-500', 
    bgColor: 'bg-yellow-100',
    label: 'Grade Received',
    tier: 'standard',
  },
  UNLOCK_APPROVED: { 
    icon: Unlock, 
    color: 'text-green-500', 
    bgColor: 'bg-green-100',
    label: 'Unlock Approved',
    tier: 'standard',
  },
  UNLOCK_REJECTED: { 
    icon: Lock, 
    color: 'text-red-500', 
    bgColor: 'bg-red-100',
    label: 'Unlock Rejected',
    tier: 'standard',
  },
  UNLOCK_REVOKED: { 
    icon: Lock, 
    color: 'text-red-600', 
    bgColor: 'bg-red-100',
    label: 'Access Revoked',
    tier: 'urgent',
  },
  TASK_ASSIGNED: { 
    icon: ArrowRight, 
    color: 'text-teal-500', 
    bgColor: 'bg-teal-100',
    label: 'Task Assigned',
    tier: 'standard',
  },
  ESCALATION_LEADER: { 
    icon: AlertTriangle, 
    color: 'text-amber-600', 
    bgColor: 'bg-amber-100',
    label: 'Leader Escalation',
    tier: 'urgent',
  },
  ESCALATION_BOD: { 
    icon: Megaphone, 
    color: 'text-rose-600', 
    bgColor: 'bg-rose-100',
    label: 'BOD Escalation',
    tier: 'urgent',
  },
  MANAGEMENT_INSTRUCTION: { 
    icon: Megaphone, 
    color: 'text-indigo-600', 
    bgColor: 'bg-indigo-100',
    label: 'Executive Directive',
    tier: 'executive',
  },
};

// Tier-based row styling
const TIER_STYLES = {
  executive: {
    row: 'bg-indigo-50 border-l-4 border-l-indigo-600',
    rowHover: 'hover:bg-indigo-100/70',
    titleColor: 'text-indigo-900 font-bold uppercase text-xs tracking-wide',
  },
  urgent: {
    row: 'bg-white border-l-4 border-l-rose-400',
    rowHover: 'hover:bg-rose-50/50',
    titleColor: 'text-rose-700 font-semibold',
  },
  standard: {
    row: 'bg-white',
    rowHover: 'hover:bg-gray-50',
    titleColor: 'text-gray-800 font-semibold',
  },
};

// Format relative time
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function NotificationCenter({ onNotificationClick }) {
  const { profile, isAdmin, isExecutive } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewNotification, setHasNewNotification] = useState(false);
  const [activeTab, setActiveTab] = useState('all');

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return;
    
    try {
      // Fetch notifications - actor name will be fetched separately if needed
      const { data, error } = await withTimeout(
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(30),
        10000
      );

      if (error) throw error;
      
      setNotifications(data || []);
      setUnreadCount((data || []).filter(n => !n.is_read).length);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription for new notifications
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`
        },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev]);
          setUnreadCount(prev => prev + 1);
          setHasNewNotification(true);
          setTimeout(() => setHasNewNotification(false), 3000);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${profile.id}`
        },
        (payload) => {
          setNotifications(prev => 
            prev.map(n => n.id === payload.new.id ? payload.new : n)
          );
          setNotifications(prev => {
            setUnreadCount(prev.filter(n => !n.is_read).length);
            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Mark single notification as read
  const markAsRead = async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  // Mark all as read
  const markAllAsRead = async () => {
    if (unreadCount === 0) return;
    
    setMarkingAllRead(true);
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('user_id', profile.id)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error marking all as read:', err);
    } finally {
      setMarkingAllRead(false);
    }
  };

  // Handle notification click - navigate to the action plan
  const handleNotificationClick = async (notification) => {
    // 1. Close dropdown immediately for snappy UX
    setIsOpen(false);
    
    // 2. Mark as read (fire-and-forget, never blocks navigation)
    if (!notification.is_read) {
      markAsRead(notification.id).catch(() => {});
    }
    
    // 3. Always navigate — regardless of read state
    if (notification.resource_type === 'ACTION_PLAN' && notification.resource_id) {
      try {
        const { data: plan, error } = await supabase
          .from('action_plans')
          .select('department_code')
          .eq('id', notification.resource_id)
          .single();
        
        if (!error && plan) {
          const userRole = (profile?.role || '').toLowerCase();
          
          if (isAdmin || isExecutive) {
            navigate(`/plans?highlight=${notification.resource_id}`);
          } else if (userRole === 'staff') {
            navigate(`/workspace?highlight=${notification.resource_id}`);
          } else {
            navigate(`/dept/${plan.department_code}/plans?highlight=${notification.resource_id}`);
          }
        }
      } catch (err) {
        console.error('Error navigating to action plan:', err);
      }
    }
    
    if (onNotificationClick) {
      onNotificationClick(notification);
    }
  };

  // Get notification config
  const getConfig = (type) => {
    return NOTIFICATION_CONFIG[type] || {
      icon: Bell,
      color: 'text-gray-500',
      bgColor: 'bg-gray-100',
      label: 'Notification'
    };
  };

  // Filter notifications by tab
  const filteredNotifications = activeTab === 'mentions'
    ? notifications.filter(n => n.type === 'MENTION' || n.type === 'NEW_COMMENT')
    : notifications;

  // Render notification item
  const renderNotificationItem = (notification) => {
    const config = getConfig(notification.type);
    const IconComponent = config.icon;
    const tier = TIER_STYLES[config.tier] || TIER_STYLES.standard;
    const unreadTint = !notification.is_read && config.tier === 'standard' ? 'bg-blue-50/60' : '';
    
    return (
      <button
        key={notification.id}
        onClick={() => handleNotificationClick(notification)}
        className={`w-full text-left px-4 py-3 transition-colors border-b border-gray-100/80 last:border-b-0 ${tier.row} ${tier.rowHover} ${unreadTint}`}
      >
        <div className="flex gap-3">
          {/* Icon */}
          <div className={`flex-shrink-0 w-9 h-9 rounded-full ${config.bgColor} flex items-center justify-center`}>
            <IconComponent className={`w-4 h-4 ${config.color}`} />
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title row with time-ago top-right */}
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm leading-snug ${tier.titleColor}`}>
                {notification.title || config.label}
              </p>
              <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5">
                {formatRelativeTime(notification.created_at)}
              </span>
            </div>
            
            {/* Message */}
            {notification.message && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                {notification.message}
              </p>
            )}
          </div>
          
          {/* Unread indicator */}
          {!notification.is_read && (
            <div className={`flex-shrink-0 w-2 h-2 rounded-full mt-1.5 ${config.tier === 'executive' ? 'bg-indigo-500' : config.tier === 'urgent' ? 'bg-rose-500' : 'bg-blue-500'}`} />
          )}
        </div>
      </button>
    );
  };

  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger asChild>
        <button
          className={`relative p-2 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-teal-500 ${
            isOpen 
              ? 'bg-gray-100 text-gray-700' 
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
          aria-label="Notifications"
        >
          <Bell className={`w-5 h-5 ${hasNewNotification ? 'animate-bounce' : ''}`} />
          
          {/* Unread badge */}
          {unreadCount > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center px-1 text-[10px] font-bold text-white bg-red-500 rounded-full ${hasNewNotification ? 'animate-pulse' : ''}`}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-[9999] w-80 sm:w-[380px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in-0 zoom-in-95"
        >
          {/* Header with Tabs */}
          <div className="border-b border-gray-100">
            <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
              <div className="flex items-center justify-between px-4 pt-3 pb-0">
                <Tabs.List className="flex gap-1">
                  <Tabs.Trigger
                    value="all"
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'all'
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    All
                  </Tabs.Trigger>
                  <Tabs.Trigger
                    value="mentions"
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      activeTab === 'mentions'
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Mentions
                  </Tabs.Trigger>
                </Tabs.List>
                
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    disabled={markingAllRead}
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium disabled:opacity-50 flex items-center gap-1 px-2 py-1 rounded hover:bg-teal-50 transition-colors"
                  >
                    {markingAllRead ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Check className="w-3 h-3" />
                    )}
                    Mark all read
                  </button>
                )}
              </div>
              
              {/* Subtle divider */}
              <div className="h-3" />
            </Tabs.Root>
          </div>

          {/* Notification List */}
          <div className="max-h-[420px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
              </div>
            ) : filteredNotifications.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center py-16 px-4">
                <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-3">
                  <Inbox className="w-7 h-7 text-gray-400" />
                </div>
                <p className="text-gray-600 font-medium text-sm">You're all caught up!</p>
                <p className="text-xs text-gray-400 mt-1">
                  {activeTab === 'mentions' ? 'No mentions yet' : 'No notifications'}
                </p>
              </div>
            ) : (
              <div>
                {filteredNotifications.map(renderNotificationItem)}
              </div>
            )}
          </div>

          {/* Footer */}
          {filteredNotifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
              <p className="text-xs text-gray-400 text-center">
                {filteredNotifications.length} notification{filteredNotifications.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
