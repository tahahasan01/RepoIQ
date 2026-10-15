import { motion } from "framer-motion";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import {
  Search,
  Zap,
  Play,
  Gauge,
  ListFilter,
  FileText,
  MessageSquare,
  Wand2,
  Users,
  Bell,
  Webhook,
  UserX,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { CONTACT_EMAIL } from "@/content/legal";
import {
  ANALYSIS_MAX_FILES,
  AUTOFIX_MAX_FILES,
  AUTOFIX_MAX_FINDINGS,
  CHAT_MAX_FILES,
  DAILY_AI_ALLOWANCE,
} from "@/content/plan";

/**
 * In-page documentation. Each section is data, so the search box filters on
 * exactly the text a reader sees. Text in `backticks` renders as code.
 *
 * Everything here describes the product as built. Before changing a section,
 * check it against the code it describes (paths are noted per section).
 */

type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "code"; text: string };

interface DocSection {
  id: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  blocks: Block[];
}

const sections: DocSection[] = [
  {
    // SignUp.tsx, GitHubAccessNotice.tsx, Repositories.tsx; README "GitHub App"
    id: "getting-started",
    title: "Getting started",
    icon: Zap,
    blocks: [
      {
        kind: "p",
        text: "RepoIQ signs you in with GitHub and reads code through the RepoIQ GitHub App, which you install only on the repositories you want reviewed. There are no RepoIQ passwords.",
      },
      {
        kind: "steps",
        items: [
          "Click Sign up, then Continue with GitHub.",
          "GitHub asks you to install the RepoIQ GitHub App. Choose All repositories, or Only select repositories and pick them.",
          "GitHub sends you back to RepoIQ, signed in, on the Repositories page.",
          "If a repository is missing, click Refresh to sync the list from GitHub.",
        ],
      },
      {
        kind: "p",
        text: "To change which repositories RepoIQ can see, configure the RepoIQ installation in your GitHub settings under Applications, then click Refresh in RepoIQ. Next time, use Sign in.",
      },
      { kind: "p", text: "The GitHub App asks for these permissions:" },
      {
        kind: "list",
        items: [
          "Contents: read and write. RepoIQ reads your code; it writes only when you approve an auto-fix pull request.",
          "Pull requests: read and write, to open auto-fix pull requests.",
          "Metadata: read-only.",
          "Email addresses: read-only, for your account profile.",
        ],
      },
    ],
  },
  {
    // Repositories.tsx, Backend/app/tasks/analysis_tasks.py, incremental_analysis.py
    id: "running-an-analysis",
    title: "Running an analysis",
    icon: Play,
    blocks: [
      {
        kind: "p",
        text: "On the Repositories page, click Analyze Now on a repository. RepoIQ fetches the source from GitHub, reviews it with Claude, and runs static checks alongside. Progress updates live while it runs, and you can cancel it.",
      },
      {
        kind: "list",
        items: [
          `Each analysis reviews up to ${ANALYSIS_MAX_FILES} files, chosen by importance, and records how many files were eligible and how many were read.`,
          "Findings are cached per file by Git blob SHA for up to 30 days. Files that have not changed are not sent to the model again, so re-analysing is fast.",
          "If every AI batch fails, the analysis is marked failed instead of being shown as a review. A repository with no source RepoIQ can read fails with that reason instead of scoring 100.",
          "Click History on a repository to see its earlier analyses.",
        ],
      },
      {
        kind: "p",
        text: `Analysis, chat and auto-fix share a daily AI allowance of ${DAILY_AI_ALLOWANCE} model tokens per account. When it runs out, new AI requests are refused until it resets at midnight UTC.`,
      },
    ],
  },
  {
    // Backend/app/services/scoring.py; README "How scoring works"
    id: "scores",
    title: "Understanding scores",
    icon: Gauge,
    blocks: [
      {
        kind: "p",
        text: "RepoIQ scores security, quality, architecture and documentation, plus an overall score. Scores come from the findings alone, never from the model's opinion of the code, so the same findings always give the same score and every score can be explained by the list that produced it.",
      },
      { kind: "p", text: "Each finding carries a penalty by severity:" },
      {
        kind: "table",
        head: ["Severity", "Critical", "High", "Medium", "Low", "Info"],
        rows: [["Penalty", "15", "7", "3", "1", "0"]],
      },
      {
        kind: "p",
        text: "Penalties add up per area and decay exponentially: `score = 100 × e^(−penalty / 60)`. More findings always lower the score, and it never goes below zero. One critical finding gives 78, three give 47, six give 22.",
      },
      {
        kind: "p",
        text: "The overall score weights security 35%, quality 30%, architecture 20% and documentation 15%, and is capped at 15 points above the weakest area: a repository is never much better than its worst part.",
      },
      {
        kind: "p",
        text: "The repository overview shows the score trend across analyses. Because an analysis reviews a sample of files, treat a score as a verdict on what was reviewed.",
      },
    ],
  },
  {
    // Issues.tsx, Files.tsx
    id: "issues-and-files",
    title: "Issues and files",
    icon: ListFilter,
    blocks: [
      {
        kind: "p",
        text: "Every finding has a severity, a category, the file, the line number and a suggested fix.",
      },
      {
        kind: "list",
        items: [
          "Issues tab: search findings and filter them by severity and type. Select findings there to fix them with AI.",
          "Files tab: browse the repository's file tree with findings marked against the code.",
          "A finding is marked fixed when a later analysis no longer reports it.",
        ],
      },
    ],
  },
  {
    // Documentation.tsx, components/docs/RoadmapPanel.tsx, services/reportService.ts
    id: "documentation-tab",
    title: "Reports and the Documentation tab",
    icon: FileText,
    blocks: [
      { kind: "p", text: "Each repository's Documentation tab has four views, built from its latest analysis:" },
      {
        kind: "list",
        items: [
          "Full Analysis Report: scores, issue counts and every finding. Download opens a printable page you can print or save as PDF.",
          "Bug Report: the findings as a printable bug list.",
          "Roadmap: a prioritised plan for improving the repository, generated by Claude from the analysis.",
          "Architecture: a diagram of the repository generated from its file tree.",
        ],
      },
    ],
  },
  {
    // components/Chatbot.tsx, Backend/app/services/chat_service.py
    id: "chat",
    title: "Ask about this repo",
    icon: MessageSquare,
    blocks: [
      {
        kind: "p",
        text: "Open a repository and click Ask about this repo. Answers are grounded in the repository's latest completed analysis: its scores and its most severe open findings.",
      },
      {
        kind: "list",
        items: [
          `Attach up to ${CHAT_MAX_FILES} files to a question. RepoIQ fetches them from GitHub for that answer.`,
          "The conversation is saved with the repository. Clear it from the chat panel to delete it.",
          "Answers are written by AI. Check them against the code before you rely on them.",
        ],
      },
    ],
  },
  {
    // Issues.tsx, components/autofix/, Backend/app/services/autofix.py
    id: "auto-fix",
    title: "Auto-fix",
    icon: Wand2,
    blocks: [
      {
        kind: "p",
        text: "Auto-fix turns findings you select into a draft pull request. Nothing reaches GitHub until you have reviewed and approved the exact diff.",
      },
      {
        kind: "steps",
        items: [
          `On the Issues tab, select up to ${AUTOFIX_MAX_FINDINGS} findings, across up to ${AUTOFIX_MAX_FILES} files, and click Fix with AI.`,
          "RepoIQ proposes a change for each file. Review every diff.",
          "Approve to publish, or discard the proposal.",
          "On approval, RepoIQ creates a new `repoiq/fix-…` branch and opens a draft pull request. It never pushes to an existing branch.",
        ],
      },
      { kind: "p", text: "Auto-fix needs:" },
      {
        kind: "list",
        items: [
          "The GitHub App's Contents and Pull requests permissions set to read and write. With read-only contents, auto-fix is unavailable.",
          "Your own write access to the repository on GitHub, checked again when the change is published.",
        ],
      },
      { kind: "p", text: "RepoIQ refuses a proposed change that:" },
      {
        kind: "list",
        items: [
          "changes lines far from the findings you selected, or changes too much;",
          "touches CI or build files, such as `.github/`, `Dockerfile` or `package.json`;",
          "contains invisible or direction-changing Unicode characters;",
          "is much shorter than the original file, which usually means a truncated answer.",
        ],
      },
    ],
  },
  {
    // Organizations.tsx, OrganizationDetail.tsx, TeamDetail.tsx, ExecutiveDashboard.tsx
    id: "organisations",
    title: "Organisations, teams and invitations",
    icon: Users,
    blocks: [
      {
        kind: "p",
        text: "Organisations group teams, and teams group people and repositories. Open Organizations or Teams from your avatar menu.",
      },
      {
        kind: "list",
        items: [
          "Create an organisation, add teams to it, and assign repositories to teams.",
          "Invite someone to a team by GitHub username or email. They need a RepoIQ account, get the invitation in RepoIQ (under the bell icon), and join only when they accept it.",
          "Team roles are Member, Lead and Manager. Managers can invite and remove members.",
          "A team's page shows its repositories' scores and members' contributions.",
          "Each organisation has an executive dashboard that compares its teams.",
        ],
      },
    ],
  },
  {
    // components/alerts/OrganizationAlerts.tsx, NotificationSettingsCard.tsx, Backend/app/services/alert_service.py
    id: "alerts",
    title: "Alerts and thresholds",
    icon: Bell,
    blocks: [
      {
        kind: "p",
        text: "Alerts are raised from the latest analysis of each repository assigned to a team, and appear on the organisation's Alerts tab. There are three kinds:",
      },
      {
        kind: "list",
        items: [
          "Score below threshold: the overall score is below your alert threshold.",
          "Critical issues: the analysis found critical findings.",
          "Security vulnerabilities: the security review found critical findings.",
        ],
      },
      {
        kind: "p",
        text: "Set your threshold (60 by default) and turn security alerts on or off in Settings, under Notifications. You see only the alerts your own settings ask for.",
      },
      {
        kind: "p",
        text: "Checks run on a schedule (hourly by default) and when you click Check now. One condition in one analysis raises one alert, however often the checks run. Acknowledge an alert to dismiss it.",
      },
      {
        kind: "p",
        text: "Alerts are shown in RepoIQ only. RepoIQ sends no email and has no Slack integration. To receive events on your own systems, use webhooks.",
      },
    ],
  },
  {
    // components/settings/WebhooksCard.tsx, Backend/app/services/webhook_service.py
    id: "webhooks",
    title: "Webhooks",
    icon: Webhook,
    blocks: [
      {
        kind: "p",
        text: "In Settings, under Webhooks, add an HTTPS URL and choose the events to send. RepoIQ generates a signing secret and shows it once: store it on your server.",
      },
      {
        kind: "table",
        head: ["Event", "data"],
        rows: [
          [
            "`analysis.completed`",
            "`repository_id`, `analysis_id`, `overall_score`, `security_score`, `quality_score`, `total_issues`, `critical_issues`, `high_issues`",
          ],
          ["`analysis.failed`", "`repository_id`, `analysis_id`, `error`"],
          ["`test.ping`", "Sent by Send test, to check your endpoint"],
        ],
      },
      { kind: "p", text: "Each delivery is a JSON `POST`:" },
      {
        kind: "code",
        text: `POST <your URL>
Content-Type: application/json
User-Agent: RepoIQ-Webhook/1.0
X-RepoIQ-Event: analysis.completed
X-RepoIQ-Delivery: <id, the same on every retry of one delivery>
X-RepoIQ-Timestamp: <ISO 8601, UTC>
X-RepoIQ-Signature: sha256=<hex HMAC-SHA256 of the raw body>

{"data": {...}, "event": "analysis.completed", "timestamp": "..."}`,
      },
      {
        kind: "p",
        text: "To verify a delivery, compute the HMAC-SHA256 of the raw request body, exactly as received, keyed by your secret. Compare `sha256=` plus its hex digest with the `X-RepoIQ-Signature` header using a constant-time comparison, and reject the request if they differ. In Node.js:",
      },
      {
        kind: "code",
        text: `import crypto from "node:crypto";

function isFromRepoIQ(rawBody, signatureHeader, secret) {
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader ?? "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`,
      },
      {
        kind: "list",
        items: [
          "A 2xx or 3xx response counts as delivered. Redirects are not followed.",
          "A timeout (10 seconds), a connection failure, a 5xx, 408, 425 or 429 is retried after 5 seconds, 30 seconds and 5 minutes: four attempts in all. Any other 4xx is final.",
          "Use `X-RepoIQ-Delivery` to ignore a retry you have already processed.",
          "URLs that resolve to private or internal network addresses are refused.",
          "Each webhook shows its delivery history in Settings.",
        ],
      },
    ],
  },
  {
    // UserSettings.tsx, DeleteAccountDialog.tsx, Privacy.tsx section 8
    id: "account",
    title: "Your account and data",
    icon: UserX,
    blocks: [
      {
        kind: "p",
        text: "Signing out revokes your session on the server, not only on this device.",
      },
      {
        kind: "p",
        text: "To delete your account, open Settings, go to Danger Zone, click Delete Account and type `delete my account` to confirm. This permanently deletes your account and its data: repositories, analyses, findings, roadmaps, chat messages, auto-fix runs, webhooks and their delivery history, settings, the organisations you own with their teams and alerts, and your team memberships and invitations. It cannot be undone.",
      },
      {
        kind: "p",
        text: "Deleting your RepoIQ account does not change your GitHub account. To remove RepoIQ's access to GitHub, uninstall the RepoIQ GitHub App in your GitHub settings. The Privacy Policy lists the little that deletion does not remove.",
      },
    ],
  },
];

/** Render `code` spans inside plain text. */
function inline(text: string): ReactNode {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
      <code key={i} className="px-1.5 py-0.5 rounded bg-muted font-mono text-[0.85em] text-foreground">
        {part.slice(1, -1)}
      </code>
    ) : (
      part
    )
  );
}

function blockText(block: Block): string {
  switch (block.kind) {
    case "p":
    case "code":
      return block.text;
    case "list":
    case "steps":
      return block.items.join(" ");
    case "table":
      return [...block.head, ...block.rows.flat()].join(" ");
  }
}

function sectionText(section: DocSection): string {
  return [section.title, ...section.blocks.map(blockText)].join(" ").replace(/`/g, "").toLowerCase();
}

function DocBlock({ block }: { block: Block }) {
  switch (block.kind) {
    case "p":
      return <p className="text-muted-foreground leading-relaxed">{inline(block.text)}</p>;
    case "list":
      return (
        <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
          {block.items.map((item) => (
            <li key={item}>{inline(item)}</li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="list-decimal pl-5 space-y-2 text-muted-foreground">
          {block.items.map((item) => (
            <li key={item}>{inline(item)}</li>
          ))}
        </ol>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {block.head.map((h) => (
                  <th key={h} className="text-left font-semibold border-b border-border py-2 pr-4">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row) => (
                <tr key={row.join("|")}>
                  {row.map((cell, i) => (
                    <td key={i} className="border-b border-border py-2 pr-4 text-muted-foreground align-top">
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "code":
      return (
        <pre className="rounded-lg bg-muted p-4 overflow-x-auto text-xs sm:text-sm font-mono text-foreground">
          <code>{block.text}</code>
        </pre>
      );
  }
}

export default function Docs() {
  const [searchQuery, setSearchQuery] = useState("");
  const location = useLocation();

  useEffect(() => {
    document.title = "Documentation - RepoIQ";
  }, []);

  // The router does not scroll to a hash on its own; do it once the page has rendered.
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) {
      window.scrollTo(0, 0);
      return;
    }
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [location.hash]);

  const searchIndex = useMemo(() => sections.map((s) => ({ id: s.id, text: sectionText(s) })), []);

  const query = searchQuery.trim().toLowerCase();
  const visible = query
    ? sections.filter((s) => {
        const text = searchIndex.find((entry) => entry.id === s.id)?.text ?? "";
        return query.split(/\s+/).every((word) => text.includes(word));
      })
    : sections;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto mb-12"
          >
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              <span className="gradient-text">Documentation</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              How to connect GitHub, run an analysis, read the results, and use fixes, teams, alerts and webhooks.
            </p>

            {/* Search */}
            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search documentation"
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 text-lg"
              />
            </div>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-8 max-w-6xl mx-auto">
            {/* Contents */}
            <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">Contents</h2>
              <ul className="grid grid-cols-2 lg:grid-cols-1 gap-1">
                {visible.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted hover:text-foreground ${
                        location.hash === `#${section.id}` ? "text-link" : "text-muted-foreground"
                      }`}
                    >
                      <section.icon className="h-4 w-4 flex-shrink-0" />
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Sections */}
            <div className="space-y-8 min-w-0">
              {visible.length === 0 && (
                <div className="glass-panel rounded-xl p-8 text-center">
                  <p className="text-muted-foreground mb-4">Nothing in the documentation matches “{searchQuery.trim()}”.</p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-link hover:underline"
                  >
                    Clear the search
                  </button>
                </div>
              )}

              {visible.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  aria-labelledby={`${section.id}-title`}
                  className="glass-panel rounded-xl p-6 sm:p-8 scroll-mt-24"
                >
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <section.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h2 id={`${section.id}-title`} className="text-xl sm:text-2xl font-semibold">
                      <a href={`#${section.id}`} className="hover:underline underline-offset-4">
                        {section.title}
                      </a>
                    </h2>
                  </div>
                  <div className="space-y-4">
                    {section.blocks.map((block, i) => (
                      <DocBlock key={i} block={block} />
                    ))}
                  </div>
                </section>
              ))}

              <p className="text-sm text-muted-foreground text-center pt-4">
                Can't find what you need? Email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-link hover:underline">
                  {CONTACT_EMAIL}
                </a>
                , or read the <Link to="/security" className="text-link hover:underline">Security</Link> and{" "}
                <Link to="/privacy" className="text-link hover:underline">Privacy</Link> pages.
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
