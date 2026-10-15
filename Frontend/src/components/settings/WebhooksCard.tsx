import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Webhook as WebhookIcon,
  XCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useWebhookDeliveries,
  useWebhooks,
} from "@/hooks/useNotificationQueries";
import type { Webhook, WebhookDelivery, WebhookDeliveryStatus } from "@/lib/api";
import { ApiRequestError } from "@/lib/apiErrors";
import { WEBHOOK_EVENTS, generateWebhookSecret, parseWebhookUrl } from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/timeUtils";

const EVENT_LABELS: Record<string, string> = {
  "*": "All events",
  "test.ping": "Test",
  ...Object.fromEntries(WEBHOOK_EVENTS.map((e) => [e.value, e.label])),
};

const STATUS_META: Record<
  WebhookDeliveryStatus,
  { label: string; icon: React.ComponentType<{ className?: string }>; className: string }
> = {
  success: { label: "Delivered", icon: CheckCircle2, className: "border-green-500/30 text-green-700 dark:text-green-400" },
  retrying: { label: "Retrying", icon: RefreshCw, className: "border-amber-500/30 text-amber-700 dark:text-amber-400" },
  failed: { label: "Failed", icon: XCircle, className: "border-destructive/40 text-destructive" },
  blocked: { label: "Blocked", icon: Ban, className: "border-destructive/40 text-destructive" },
};

const ERROR_LABELS: Record<string, string> = {
  timeout: "Timed out",
  connection_error: "Couldn't connect",
  unsafe_destination: "Address not allowed",
  request_error: "Request error",
};

function deliveryError(error: string | null): string | null {
  if (!error) return null;
  if (ERROR_LABELS[error]) return ERROR_LABELS[error];
  const http = /^http_(\d{3})$/.exec(error);
  return http ? `HTTP ${http[1]}` : error;
}

function DeliveryRow({ delivery }: { delivery: WebhookDelivery }) {
  const meta = STATUS_META[delivery.status] ?? STATUS_META.failed;
  const Icon = meta.icon;
  const error = deliveryError(delivery.error);
  return (
    <tr className="border-t">
      <td className="py-2 pr-3">
        <Badge variant="outline" className={`gap-1 ${meta.className}`}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
      </td>
      <td className="py-2 pr-3">{EVENT_LABELS[delivery.event_type] ?? delivery.event_type}</td>
      <td className="py-2 pr-3 tabular-nums">
        {delivery.response_code ? delivery.response_code : <span className="text-muted-foreground">No response</span>}
        {error && <span className="block text-xs text-muted-foreground">{error}</span>}
      </td>
      <td className="py-2 pr-3 tabular-nums">{delivery.attempt}</td>
      <td className="py-2 text-muted-foreground whitespace-nowrap" title={new Date(delivery.delivered_at).toLocaleString()}>
        {formatRelativeTime(delivery.delivered_at)}
      </td>
    </tr>
  );
}

function DeliveryHistory({ webhookId }: { webhookId: string }) {
  const { data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isRefetching } =
    useWebhookDeliveries(webhookId, true);
  const deliveries = data?.pages.flatMap((p) => p.deliveries) ?? [];

  if (isLoading) {
    return <Skeleton className="h-20 w-full" aria-label="Loading deliveries" />;
  }
  if (error) {
    return (
      <div className="text-sm space-y-2" role="alert">
        <p>Couldn't load the delivery history. {error instanceof Error ? error.message : ""}</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (deliveries.length === 0) {
    return <p className="text-sm text-muted-foreground">No deliveries yet. Send a test to check your endpoint.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Newest first. Each retry is listed as its own attempt.</p>
        <Button size="sm" variant="ghost" className="gap-1 h-7" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`h-3 w-3 ${isRefetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="pb-2 pr-3 font-medium">Status</th>
              <th className="pb-2 pr-3 font-medium">Event</th>
              <th className="pb-2 pr-3 font-medium">Response</th>
              <th className="pb-2 pr-3 font-medium">Attempt</th>
              <th className="pb-2 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map((d) => (
              <DeliveryRow key={d.id} delivery={d} />
            ))}
          </tbody>
        </table>
      </div>
      {hasNextPage && (
        <Button size="sm" variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Load more
        </Button>
      )}
    </div>
  );
}

function WebhookRow({ webhook }: { webhook: Webhook }) {
  const { toast } = useToast();
  const [showDeliveries, setShowDeliveries] = useState(false);
  const test = useTestWebhook();
  const remove = useDeleteWebhook();

  const sendTest = () =>
    test.mutate(webhook.id, {
      onSuccess: () =>
        toast({ title: "Test delivered", description: "Your endpoint answered with a success status." }),
      onError: (err) =>
        toast({
          title: "Test delivery failed",
          description:
            err instanceof ApiRequestError && err.status === 502
              ? "Your endpoint didn't accept the request. Open the delivery history to see what it answered."
              : err instanceof Error
                ? err.message
                : "Something went wrong. Try again.",
          variant: "destructive",
        }),
    });

  return (
    <li className="p-4 bg-muted/30 rounded-lg space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-mono text-sm break-all">{webhook.url}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {webhook.events.map((e) => (
              <Badge key={e} variant="secondary" className="font-normal">
                {EVENT_LABELS[e] ?? e}
              </Badge>
            ))}
            <span className="text-xs text-muted-foreground">Added {formatRelativeTime(webhook.created_at)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" className="gap-2" onClick={sendTest} disabled={test.isPending}>
            {test.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send test
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="gap-1"
            onClick={() => setShowDeliveries((v) => !v)}
            aria-expanded={showDeliveries}
          >
            Deliveries
            {showDeliveries ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Delete webhook ${webhook.url}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this webhook?</AlertDialogTitle>
                <AlertDialogDescription>
                  RepoIQ stops sending events to <span className="font-mono break-all">{webhook.url}</span> and its
                  delivery history is deleted. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() =>
                    remove.mutate(webhook.id, {
                      onSuccess: () => toast({ title: "Webhook deleted" }),
                      onError: (err) =>
                        toast({
                          title: "Couldn't delete the webhook",
                          description: err instanceof Error ? err.message : "Try again.",
                          variant: "destructive",
                        }),
                    })
                  }
                >
                  Delete webhook
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      {showDeliveries && (
        <div className="pt-3 border-t">
          <DeliveryHistory webhookId={webhook.id} />
        </div>
      )}
    </li>
  );
}

function CreateWebhookDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { toast } = useToast();
  const create = useCreateWebhook();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(WEBHOOK_EVENTS.map((e) => e.value));
  const [formError, setFormError] = useState<string | null>(null);
  // Set once the webhook exists: the only time its secret can be shown.
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);

  const reset = () => {
    setUrl("");
    setEvents(WEBHOOK_EVENTS.map((e) => e.value));
    setFormError(null);
    setCreatedSecret(null);
    create.reset();
  };

  const close = (next: boolean) => {
    // Closing from the secret step is a deliberate "done"; never drop the
    // secret while a create is still in flight.
    if (!next && create.isPending) return;
    onOpenChange(next);
    if (!next) reset();
  };

  const submit = () => {
    const parsed = parseWebhookUrl(url);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    if (events.length === 0) {
      setFormError("Choose at least one event to send.");
      return;
    }
    setFormError(null);
    const secret = generateWebhookSecret();
    create.mutate(
      { url: parsed.value, events, secret },
      {
        onSuccess: () => setCreatedSecret(secret),
        onError: (err) =>
          setFormError(
            err instanceof Error ? err.message : "Couldn't add the webhook. Check the URL and try again."
          ),
      }
    );
  };

  const copySecret = async () => {
    if (!createdSecret) return;
    try {
      await navigator.clipboard.writeText(createdSecret);
      toast({ title: "Signing secret copied" });
    } catch {
      toast({
        title: "Couldn't copy the secret",
        description: "Select it and copy it manually.",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        {createdSecret ? (
          <>
            <DialogHeader>
              <DialogTitle>Webhook added</DialogTitle>
              <DialogDescription>
                Copy the signing secret now. You won't be able to see it again.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="webhook-secret">Signing secret</Label>
                <div className="flex gap-2">
                  <Input
                    id="webhook-secret"
                    readOnly
                    value={createdSecret}
                    className="font-mono text-xs"
                    onFocus={(e) => e.target.select()}
                  />
                  <Button variant="outline" className="gap-2 shrink-0" onClick={copySecret}>
                    <Copy className="h-4 w-4" />
                    Copy
                  </Button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground space-y-2">
                <p>
                  Every request RepoIQ sends carries an{" "}
                  <code className="font-mono text-foreground">X-RepoIQ-Signature</code> header:{" "}
                  <code className="font-mono text-foreground">sha256=</code> followed by the hex HMAC-SHA256 of the raw
                  request body, keyed with this secret.
                </p>
                <p>
                  On your server, compute the same HMAC over the body exactly as received and compare it to the header
                  with a constant-time comparison. Reject the request if they differ.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => close(false)}>I've saved the secret</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add a webhook</DialogTitle>
              <DialogDescription>
                RepoIQ will send a signed POST request to this URL when the events you choose happen.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="webhook-url">Payload URL</Label>
                <Input
                  id="webhook-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com/hooks/repoiq"
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    setFormError(null);
                  }}
                  autoComplete="off"
                  aria-invalid={formError !== null}
                  aria-describedby={formError ? "webhook-form-error" : undefined}
                />
              </div>
              <fieldset className="space-y-3">
                <legend className="text-sm font-medium mb-2">Events</legend>
                {WEBHOOK_EVENTS.map((event) => {
                  const id = `webhook-event-${event.value}`;
                  return (
                    <div key={event.value} className="flex items-start gap-3">
                      <Checkbox
                        id={id}
                        checked={events.includes(event.value)}
                        onCheckedChange={(checked) => {
                          setFormError(null);
                          setEvents((current) =>
                            checked === true
                              ? [...current, event.value]
                              : current.filter((value) => value !== event.value)
                          );
                        }}
                        className="mt-0.5"
                      />
                      <div>
                        <Label htmlFor={id} className="font-medium">
                          {event.label}
                        </Label>
                        <p className="text-xs text-muted-foreground">{event.description}</p>
                      </div>
                    </div>
                  );
                })}
              </fieldset>
              {formError && (
                <p id="webhook-form-error" className="text-sm text-destructive flex items-start gap-2" role="alert">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  {formError}
                </p>
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => close(false)} disabled={create.isPending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add webhook
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Webhook endpoints for the signed-in user, with per-webhook delivery history. */
export function WebhooksCard() {
  const { data: webhooks = [], isLoading, error, refetch } = useWebhooks();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <section className="glass-panel rounded-xl p-6" aria-labelledby="webhooks-heading">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <WebhookIcon className="h-5 w-5 text-primary" />
          <h2 id="webhooks-heading" className="text-xl font-semibold">
            Webhooks
          </h2>
        </div>
        <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />
          Add webhook
        </Button>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Send analysis results to your own systems, such as CI, chat bots or dashboards, as soon as they're ready.
      </p>

      {isLoading ? (
        <Skeleton className="h-20 w-full" aria-label="Loading webhooks" />
      ) : error ? (
        <div className="p-4 rounded-lg bg-destructive/10 text-sm space-y-3" role="alert">
          <p>Couldn't load your webhooks. {error instanceof Error ? error.message : ""}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : webhooks.length === 0 ? (
        <div className="p-6 bg-muted/30 rounded-lg text-center">
          <p className="text-sm text-muted-foreground mb-4">
            No webhooks yet. Add one to have RepoIQ notify a URL you control whenever an analysis completes or fails.
          </p>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Add webhook
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {webhooks.map((webhook) => (
            <WebhookRow key={webhook.id} webhook={webhook} />
          ))}
        </ul>
      )}

      <CreateWebhookDialog open={createOpen} onOpenChange={setCreateOpen} />
    </section>
  );
}
