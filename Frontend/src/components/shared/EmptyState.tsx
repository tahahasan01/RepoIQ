import type { ComponentType, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  body?: ReactNode;
  /** A button or link that gets the user out of the empty state. */
  action?: ReactNode;
  /** "error": something failed; shows a Retry button when `onRetry` is given. */
  variant?: "default" | "error";
  onRetry?: () => void;
  /** Disables Retry and spins its icon while a retry is in flight. */
  retrying?: boolean;
  className?: string;
}

/** What a view shows when it has nothing to show, or could not load. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  variant = "default",
  onRetry,
  retrying = false,
  className,
}: EmptyStateProps) {
  const isError = variant === "error";
  const Icon = icon ?? (isError ? AlertTriangle : undefined);
  return (
    <div
      role={isError ? "alert" : undefined}
      className={cn("flex flex-col items-center justify-center px-4 py-12 text-center", className)}
    >
      {Icon && <Icon className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {body && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</div>}
      {(action || (isError && onRetry)) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {isError && onRetry && (
            <Button variant="outline" size="sm" className="gap-2" onClick={onRetry} disabled={retrying}>
              <RefreshCw className={cn("h-4 w-4", retrying && "animate-spin")} aria-hidden="true" />
              Retry
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
