/**
 * Time formatting utilities for human-readable timestamps
 */

/**
 * Format a date string to relative time (e.g., "2 minutes ago", "3 hours ago", "Yesterday")
 */
export function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    // Just now (less than 1 minute)
    if (diffSeconds < 60) {
      return "Just now";
    }
    
    // Minutes ago
    if (diffMinutes < 60) {
      return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
    }
    
    // Hours ago
    if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
    }
    
    // Yesterday
    if (diffDays === 1) {
      return "Yesterday";
    }
    
    // Days ago (up to 7 days)
    if (diffDays < 7) {
      return `${diffDays} days ago`;
    }
    
    // More than a week - show formatted date
    return formatShortDate(dateString);
  } catch {
    return "N/A";
  }
}

/**
 * Format a date to short format (e.g., "Jan 27, 4:00 PM")
 */
export function formatShortDate(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch {
    return "N/A";
  }
}

/**
 * Format a date to full format (e.g., "Jan 27, 2026, 4:00 PM")
 */
export function formatFullDate(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  } catch {
    return "N/A";
  }
}

/**
 * Format a date to date-only format (e.g., "Jan 27, 2026")
 */
export function formatDateOnly(dateString: string | null | undefined): string {
  if (!dateString) return "N/A";
  
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(date);
  } catch {
    return "N/A";
  }
}
