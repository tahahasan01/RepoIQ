import { useState } from "react";
import { Bell, Info, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useNotificationSettings, useUpdateNotificationSettings } from "@/hooks/useNotificationQueries";
import type { NotificationSettings, NotificationSettingsUpdate } from "@/lib/api";
import { parseScoreThreshold } from "@/lib/notifications";

type ToggleField = "email_notifications" | "security_alerts" | "weekly_digest" | "auto_analyze_new_repos";

// Only settings something acts on. "Email notifications" and "Weekly digest"
// were toggles for email RepoIQ never sends, and new repositories are not
// analysed automatically; the stored fields stay, the controls do not.
const TOGGLES: { field: ToggleField; label: string; description: string }[] = [
  {
    field: "security_alerts",
    label: "Security alerts",
    description: "Show alerts when an analysis of an organization's repository finds a security problem.",
  },
];

/**
 * Account-wide notification preferences, persisted through
 * GET/PUT /users/me/settings. Each change saves on its own and is shown at
 * once; a failed save puts the previous value back.
 */
export function NotificationSettingsCard() {
  const { toast } = useToast();
  const { data: settings, isLoading, error, refetch, isRefetching } = useNotificationSettings();
  const update = useUpdateNotificationSettings();

  // Drafts exist only while the user is dragging or typing; otherwise the
  // controls show the saved value.
  const [sliderDraft, setSliderDraft] = useState<number | null>(null);
  const [thresholdText, setThresholdText] = useState<string | null>(null);
  const [thresholdError, setThresholdError] = useState<string | null>(null);

  const save = (changes: NotificationSettingsUpdate) => {
    update.mutate(changes, {
      onSuccess: () => toast({ title: "Notification settings saved" }),
      onError: (err) =>
        toast({
          title: "Couldn't save your notification settings",
          description: `${err instanceof Error ? err.message : "Something went wrong."} Your previous setting is back; try again.`,
          variant: "destructive",
        }),
    });
  };

  const saveThreshold = (current: NotificationSettings, value: number) => {
    if (value !== current.alert_score_threshold) save({ alert_score_threshold: value });
  };

  const commitThresholdText = (current: NotificationSettings) => {
    if (thresholdText === null) return;
    const parsed = parseScoreThreshold(thresholdText);
    if (!parsed.ok) {
      setThresholdError(parsed.error);
      return;
    }
    setThresholdError(null);
    setThresholdText(null);
    saveThreshold(current, parsed.value);
  };

  return (
    <section className="glass-panel rounded-xl p-6" aria-labelledby="notification-settings-heading">
      <div className="flex items-center gap-3 mb-2">
        <Bell className="h-5 w-5 text-primary" />
        <h2 id="notification-settings-heading" className="text-xl font-semibold">
          Notifications
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-6 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          These preferences are saved to your account. Email delivery isn't available yet, so RepoIQ doesn't send
          email for now.
        </span>
      </p>

      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading notification settings">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : error || !settings ? (
        <div className="p-4 rounded-lg bg-destructive/10 text-sm space-y-3" role="alert">
          <p>
            Couldn't load your notification settings.{" "}
            {error instanceof Error ? error.message : "Something went wrong."}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} className="gap-2">
            {isRefetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {TOGGLES.map(({ field, label, description }) => {
            const id = `notification-${field}`;
            return (
              <div key={field} className="flex items-center justify-between gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <Label htmlFor={id} className="font-medium">
                    {label}
                  </Label>
                  <p id={`${id}-description`} className="text-sm text-muted-foreground">
                    {description}
                  </p>
                </div>
                <Switch
                  id={id}
                  aria-describedby={`${id}-description`}
                  checked={settings[field]}
                  onCheckedChange={(checked) => save({ [field]: checked })}
                />
              </div>
            );
          })}

          <div className="p-4 bg-muted/30 rounded-lg space-y-3">
            <Label htmlFor="alert-threshold-input" className="font-medium">
              Alert me when a repository's score drops below
            </Label>
            <div className="flex items-center gap-4">
              <Slider
                aria-label="Score threshold"
                min={0}
                max={100}
                step={1}
                value={[sliderDraft ?? settings.alert_score_threshold]}
                onValueChange={([value]) => {
                  setSliderDraft(value);
                  setThresholdText(null);
                  setThresholdError(null);
                }}
                onValueCommit={([value]) => {
                  setSliderDraft(null);
                  saveThreshold(settings, value);
                }}
                className="flex-1"
              />
              <Input
                id="alert-threshold-input"
                inputMode="numeric"
                className="w-20 text-center tabular-nums"
                value={thresholdText ?? String(sliderDraft ?? settings.alert_score_threshold)}
                onChange={(e) => {
                  setThresholdText(e.target.value);
                  setThresholdError(null);
                }}
                onBlur={() => commitThresholdText(settings)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitThresholdText(settings);
                  if (e.key === "Escape") {
                    setThresholdText(null);
                    setThresholdError(null);
                  }
                }}
                aria-invalid={thresholdError !== null}
                aria-describedby="alert-threshold-help"
              />
            </div>
            <p
              id="alert-threshold-help"
              className={`text-sm ${thresholdError ? "text-destructive" : "text-muted-foreground"}`}
              role={thresholdError ? "alert" : undefined}
            >
              {thresholdError ??
                "A score from 0 to 100. Saved with your preferences; organization alerts still use RepoIQ's standard threshold for now."}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
