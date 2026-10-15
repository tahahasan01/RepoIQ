import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCircle, XCircle, Info, Zap, X, Mail } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotificationStore, Notification } from "@/stores/notificationStore";
import { formatRelativeTime } from "@/lib/timeUtils";
import { useMyInvitations } from "@/hooks/useNotificationQueries";
import { InvitationList } from "@/components/teams/InvitationList";

export default function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  const { 
    notifications, 
    unreadCount, 
    backgroundAnalyses,
    markAsRead, 
    markAllAsRead, 
    removeNotification,
    clearAll 
  } = useNotificationStore();

  // Pending team invitations come from the server, not the local store, and
  // stay counted until they are accepted or declined.
  const { data: invitations = [] } = useMyInvitations();
  const badgeCount = unreadCount + invitations.length;
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    // Escape closes too, so the dropdown can be left from the keyboard.
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);
  
  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    
    if (notification.type === 'analysis_complete' && notification.repoId) {
      setIsOpen(false);
      navigate(`/dashboard/${notification.repoId}`);
    }
  };
  
  const getIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
      case 'analysis_complete':
        return <CheckCircle className="h-5 w-5 text-score-good" aria-hidden="true" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-sev-critical" aria-hidden="true" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-muted-foreground" aria-hidden="true" />;
    }
  };
  
  const activeAnalyses = Array.from(backgroundAnalyses.values()).filter(
    a => a.status === 'in_progress' || a.status === 'prefetching'
  );
  
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={
          badgeCount > 0
            ? `Notifications: ${badgeCount} need${badgeCount === 1 ? "s" : ""} your attention`
            : "Notifications"
        }
        aria-expanded={isOpen}
      >
        <Bell className="h-5 w-5" />
        
        {/* Badge for unread count */}
        {badgeCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 z-10 h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-semibold tabular-nums"
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
        
        {/* Pulse animation for active analyses */}
        {activeAnalyses.length > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary animate-ping opacity-75" />
        )}
      </button>
      
      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="absolute right-0 top-full mt-2 w-80 bg-background border border-border rounded-lg shadow-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="p-3 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold">Notifications</h3>
              {notifications.length > 0 && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={markAllAsRead}
                    className="rounded-sm text-xs text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Mark all read
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    className="rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
            
            {/* Team invitations */}
            {invitations.length > 0 && (
              <div className="border-b border-border bg-primary/5">
                <div className="px-3 pt-3 text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  Team invitations ({invitations.length})
                </div>
                <div className="max-h-64 overflow-y-auto">
                  <InvitationList invitations={invitations} compact />
                </div>
              </div>
            )}

            {/* Active Analyses */}
            {activeAnalyses.length > 0 && (
              <div className="p-3 bg-primary/5 border-b border-border">
                <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  Active Analyses
                </div>
                {activeAnalyses.map(analysis => (
                  <div 
                    key={analysis.repoId}
                    className="flex items-center gap-2 text-sm py-1"
                  >
                    <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                    <span className="font-medium truncate flex-1">{analysis.repoName}</span>
                    <span className="text-xs text-muted-foreground">
                      {analysis.status === 'prefetching' 
                        ? 'Loading...' 
                        : `${analysis.elapsedSeconds || 0}s`}
                    </span>
                  </div>
                ))}
              </div>
            )}
            
            {/* Notifications List */}
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 && invitations.length > 0 ? null : notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                <ul>
                  {notifications.slice(0, 10).map(notification => (
                    // The item and its dismiss button are siblings, not nested:
                    // a button inside a clickable row is unreachable by keyboard.
                    <li
                      key={notification.id}
                      className={`group relative flex border-b border-border transition-colors hover:bg-accent/50 ${
                        !notification.read ? 'bg-accent/20' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleNotificationClick(notification)}
                        className="flex min-w-0 flex-1 gap-3 p-3 pr-10 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span className="mt-0.5 flex-shrink-0">
                          {getIcon(notification.type)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {notification.title}
                            {!notification.read && <span className="sr-only"> (unread)</span>}
                          </span>
                          <span className="block text-xs text-muted-foreground line-clamp-2">
                            {notification.message}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {formatRelativeTime(new Date(notification.timestamp).toISOString())}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeNotification(notification.id)}
                        aria-label={`Dismiss notification: ${notification.title}`}
                        className="absolute right-2 top-2 rounded p-1 opacity-0 transition-opacity hover:bg-accent focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100 group-focus-within:opacity-100"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            
            {/* Footer */}
            {notifications.length > 10 && (
              <div className="p-2 text-center border-t border-border">
                <span className="text-xs text-muted-foreground">
                  +{notifications.length - 10} more notifications
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
