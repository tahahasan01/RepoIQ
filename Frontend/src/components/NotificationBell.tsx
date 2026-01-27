import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, CheckCircle, XCircle, Info, Zap, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNotificationStore, Notification } from "@/stores/notificationStore";
import { formatRelativeTime } from "@/lib/timeUtils";
import { Button } from "@/components/ui/button";

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
  
  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'info':
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };
  
  const activeAnalyses = Array.from(backgroundAnalyses.values()).filter(
    a => a.status === 'in_progress' || a.status === 'prefetching'
  );
  
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-accent transition-colors"
      >
        <Bell className="h-5 w-5" />
        
        {/* Badge for unread count */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
            {unreadCount > 9 ? '9+' : unreadCount}
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
                    onClick={markAllAsRead}
                    className="text-xs text-primary hover:underline"
                  >
                    Mark all read
                  </button>
                  <button
                    onClick={clearAll}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </button>
                </div>
              )}
            </div>
            
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
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No notifications yet</p>
                </div>
              ) : (
                notifications.slice(0, 10).map(notification => (
                  <div
                    key={notification.id}
                    className={`p-3 border-b border-border hover:bg-accent/50 cursor-pointer transition-colors ${
                      !notification.read ? 'bg-accent/20' : ''
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {getIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{notification.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatRelativeTime(new Date(notification.timestamp).toISOString())}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNotification(notification.id);
                        }}
                        className="flex-shrink-0 p-1 hover:bg-accent rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
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
