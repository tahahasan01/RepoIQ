import type { ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Spinner plus a short label ("Loading team…"), announced to screen readers. */
export function LoadingState({ label, className = "py-16" }: { label: string; className?: string }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-3 text-sm text-muted-foreground ${className}`}>
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** Loading state inside a bordered surface, for a tab or section. */
export function LoadingCard({ label }: { label: string }) {
  return (
    <Card>
      <CardContent className="p-0">
        <LoadingState label={label} />
      </CardContent>
    </Card>
  );
}

/** A failed load: what went wrong and a way to try again. */
export function ErrorState({
  title,
  error,
  onRetry,
  retrying = false,
  children,
}: {
  title: string;
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  children?: ReactNode;
}) {
  const detail = error instanceof Error && error.message ? error.message : null;
  return (
    <Card>
      <CardContent role="alert" className="py-12 text-center space-y-4">
        <div className="space-y-1">
          <p className="font-medium">{title}</p>
          {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {onRetry && (
            <Button variant="outline" onClick={onRetry} disabled={retrying} className="gap-2">
              {retrying ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
              )}
              Retry
            </Button>
          )}
          {children}
        </div>
      </CardContent>
    </Card>
  );
}
