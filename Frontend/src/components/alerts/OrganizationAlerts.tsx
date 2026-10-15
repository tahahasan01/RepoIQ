import { useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, OctagonX, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  ALERT_WINDOW_DAYS,
  useAcknowledgeAlert,
  useCheckAlerts,
  useOrganizationAlerts,
} from "@/hooks/useNotificationQueries";
import type { Alert, AlertSeverity, AlertType } from "@/lib/api";
import { checkResultMessage } from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/timeUtils";

// Severity is always shown as an icon AND a word, never colour alone. Colour
// runs red > orange > amber for the severities that need action; anything
// below that (a "low" alert, or a severity this build doesn't know) is
// neutral slate - green would read as "fine", which an alert never is.
type SeverityStyle = { label: string; icon: React.ComponentType<{ className?: string }>; className: string };

const SEVERITY: Record<AlertSeverity | "low", SeverityStyle> = {
  critical: { label: "Critical", icon: OctagonX, className: "border-red-500/40 text-red-700 dark:text-red-400" },
  high: { label: "High", icon: AlertTriangle, className: "border-orange-500/40 text-orange-700 dark:text-orange-400" },
  medium: { label: "Medium", icon: AlertCircle, className: "border-amber-500/40 text-amber-700 dark:text-amber-400" },
  low: { label: "Low", icon: Info, className: "border-slate-500/40 text-slate-600 dark:text-slate-400" },
};

function severityStyle(severity: string | undefined): SeverityStyle {
  const known = SEVERITY[severity as keyof typeof SEVERITY];
  if (known) return known;
  // Unknown severity: neutral, but still labelled with the word we were sent.
  return { ...SEVERITY.low, label: severity ? severity.charAt(0).toUpperCase() + severity.slice(1) : "Unknown" };
}

const TYPE_LABELS: Record<AlertType, string> = {
  critical_issues: "Critical issues",
  security_vulnerability: "Security vulnerabilities",
  quality_threshold: "Score below threshold",
};

function AlertRow({ alert, orgId }: { alert: Alert; orgId: string }) {
  const { toast } = useToast();
  const acknowledge = useAcknowledgeAlert(orgId);
  const severity = severityStyle(alert.severity);
  const Icon = severity.icon;
  const repository = alert.details?.repository_full_name || alert.details?.repository_name || "Unknown repository";

  return (
    <li className={`flex flex-wrap items-start justify-between gap-3 p-4 border rounded-lg ${alert.acknowledged ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3 min-w-0">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${severity.className}`} aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className={severity.className}>
              {severity.label}
            </Badge>
            <span className="text-sm font-medium">{TYPE_LABELS[alert.alert_type] ?? alert.alert_type}</span>
            <span className="text-sm text-muted-foreground truncate">{repository}</span>
          </div>
          <p className="text-sm">{alert.message}</p>
          <p className="text-xs text-muted-foreground" title={new Date(alert.created_at).toLocaleString()}>
            {formatRelativeTime(alert.created_at)}
          </p>
        </div>
      </div>
      {alert.acknowledged ? (
        <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Acknowledged {alert.acknowledged_at ? formatRelativeTime(alert.acknowledged_at).toLowerCase() : ""}
        </span>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={acknowledge.isPending}
          onClick={() =>
            acknowledge.mutate(alert.id, {
              onError: (err) =>
                toast({
                  title: "Couldn't acknowledge the alert",
                  description: err instanceof Error ? err.message : "Try again.",
                  variant: "destructive",
                }),
            })
          }
        >
          {acknowledge.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Acknowledge
        </Button>
      )}
    </li>
  );
}

/** Recent alerts for an organization, with acknowledge and an on-demand check. */
export function OrganizationAlerts({ orgId }: { orgId: string }) {
  const { toast } = useToast();
  const [hideAcknowledged, setHideAcknowledged] = useState(false);
  const { data: alerts = [], isLoading, error, refetch, isFetching } = useOrganizationAlerts(orgId, !hideAcknowledged);
  const check = useCheckAlerts(orgId);

  const runCheck = () =>
    check.mutate(undefined, {
      onSuccess: (result) => toast(checkResultMessage(result)),
      onError: (err) =>
        toast({
          title: "Couldn't run the alert check",
          description: err instanceof Error ? err.message : "Try again in a moment.",
          variant: "destructive",
        }),
    });

  return (
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">Alerts</CardTitle>
          <CardDescription>
            Raised from each repository's latest analysis in the last {ALERT_WINDOW_DAYS} days. Checks also run on a
            schedule.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="hide-acknowledged" checked={hideAcknowledged} onCheckedChange={setHideAcknowledged} />
            <Label htmlFor="hide-acknowledged" className="text-sm font-normal">
              Hide acknowledged
            </Label>
          </div>
          <Button size="sm" variant="outline" className="gap-2" onClick={runCheck} disabled={check.isPending}>
            {check.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Check now
          </Button>
        </div>
      </CardHeader>
      <CardContent aria-busy={isFetching}>
        {isLoading ? (
          <div className="space-y-3" role="status">
            <p className="text-sm text-muted-foreground">Loading alerts…</p>
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-destructive/10 text-sm space-y-3" role="alert">
            <p>Couldn't load alerts. {error instanceof Error ? error.message : ""}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : alerts.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground">
            <ShieldCheck className="h-8 w-8 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm">
              {hideAcknowledged
                ? `No open alerts in the last ${ALERT_WINDOW_DAYS} days.`
                : `No alerts in the last ${ALERT_WINDOW_DAYS} days.`}
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} orgId={orgId} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
