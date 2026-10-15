-- Alerts that are stored, deduplicated and acknowledgeable, and webhook
-- delivery attempts that can be shown back to the webhook's owner.
--
-- The `alerts` table existed in the baseline but nothing wrote to it: alert
-- creation crashed before its insert (it awaited the result of an await), and
-- what it meant to write went to audit_logs instead. The columns below are what
-- the alert service needs to use the real table.

-- What the alert is about, beyond the one-line message: counts, scores, the
-- analysis that triggered it. Shown by the API as-is.
ALTER TABLE public.alerts
    ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}';

-- Identifies the CONDITION an alert reports (for example: critical issues in
-- analysis X). The checks run every hour; without a key the same unchanged
-- condition produced a new alert on every run.
ALTER TABLE public.alerts
    ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

ALTER TABLE public.alerts
    ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

ALTER TABLE public.alerts
    ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- One alert per condition, ever. The application checks first; this is the
-- backstop for two checks racing (the hourly schedule and a manual check).
-- Rows from before this migration have a NULL key, and NULLs are distinct, so
-- they do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_alerts_condition
    ON public.alerts(organization_id, repository_id, alert_type, dedupe_key);

-- The list endpoint: an organisation's alerts, newest first, within N days.
CREATE INDEX IF NOT EXISTS idx_alerts_org_created
    ON public.alerts(organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_repository
    ON public.alerts(repository_id);

-- Webhook deliveries are now retried by Celery, one row per attempt. These say
-- which attempt a row is, which event delivery it belongs to (stable across
-- retries, and sent to the receiver as X-RepoIQ-Delivery so it can discard
-- duplicates), and a short categorical reason when it failed.
ALTER TABLE public.webhook_deliveries
    ADD COLUMN IF NOT EXISTS attempt INTEGER DEFAULT 1;

ALTER TABLE public.webhook_deliveries
    ADD COLUMN IF NOT EXISTS delivery_id UUID;

ALTER TABLE public.webhook_deliveries
    ADD COLUMN IF NOT EXISTS error TEXT;

-- The delivery history endpoint: one webhook's attempts, newest first. Also the
-- index the ON DELETE CASCADE from webhooks needs.
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook
    ON public.webhook_deliveries(webhook_id, delivered_at DESC);
