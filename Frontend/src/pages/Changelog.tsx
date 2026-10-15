import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Calendar, Zap, Shield, Code2, Users, Bell, Wand2, MessageSquare } from "lucide-react";
import { useEffect } from "react";

// Summarised from the repository's commit history. RepoIQ has no version
// numbers or release tags yet, so entries are dated, not versioned. Add an
// entry here when a user-visible change ships.
const releases = [
  {
    title: "Claude, auto-fix, chat and teams",
    date: "October 15, 2026",
    major: true,
    changes: [
      { icon: Zap, type: "feature", text: "The analysis engine now runs on Claude, through Anthropic's API" },
      {
        icon: Wand2,
        type: "feature",
        text: "Auto-fix: select findings, review the exact diff, and RepoIQ opens a draft pull request only after you approve it",
      },
      {
        icon: MessageSquare,
        type: "feature",
        text: "\"Ask about this repo\": a chat grounded in the latest analysis, with up to three attached files",
      },
      {
        icon: Users,
        type: "feature",
        text: "Team pages with scores and member contributions; joining a team now needs the invited person's consent",
      },
      {
        icon: Bell,
        type: "improvement",
        text: "Alerts are stored, deduplicated, checked on a schedule and follow each person's own threshold; webhooks are signed and keep a delivery history",
      },
      { icon: Code2, type: "feature", text: "The Documentation tab shows the improvement roadmap and an architecture diagram" },
      {
        icon: Shield,
        type: "improvement",
        text: "GitHub-only sign-in, security headers, and production checks that refuse an unsafe configuration",
      },
      {
        icon: Code2,
        type: "fix",
        text: "Real line numbers on AI findings, fewer false high-severity static findings, and a usable dashboard on phones",
      },
    ],
  },
  {
    title: "Security and reliability overhaul",
    date: "August 21, 2026",
    major: true,
    changes: [
      {
        icon: Shield,
        type: "feature",
        text: "Sign-in and repository access through a GitHub App, installed only on the repositories you choose",
      },
      {
        icon: Zap,
        type: "improvement",
        text: "Incremental analysis: findings are cached per file, so unchanged files are not reviewed again",
      },
      { icon: Code2, type: "fix", text: "One scoring formula for every analysis, in place of three that disagreed" },
      { icon: Code2, type: "fix", text: "Failed analyses are reported as failed instead of as results" },
      { icon: Shield, type: "improvement", text: "A daily AI usage cap per account, and analyses queued on background workers" },
    ],
  },
  {
    title: "Deployment and CI",
    date: "February 5, 2026",
    major: false,
    changes: [
      {
        icon: Zap,
        type: "improvement",
        text: "Continuous integration for the backend and frontend, and deployment configuration for Railway",
      },
    ],
  },
  {
    title: "First version",
    date: "January 27, 2026",
    major: false,
    changes: [
      { icon: Code2, type: "feature", text: "Repository analysis with scores, an issues list and analysis reports" },
      { icon: Bell, type: "feature", text: "Analyses run in the background, with an in-app notification when they finish" },
      { icon: Code2, type: "feature", text: "Filters on the repository and issue lists" },
    ],
  },
];

const typeColors = {
  feature: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  improvement: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  fix: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20"
};

export default function Changelog() {
  useEffect(() => {
    document.title = "Changelog - RepoIQ";
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-16">
        {/* Header */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              <span className="gradient-text">Changelog</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              What has changed in RepoIQ, summarised from its commit history.
            </p>
          </motion.div>

          {/* Timeline */}
          <div className="max-w-4xl mx-auto">
            {releases.map((release, index) => (
              <motion.div
                key={release.date}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative pl-8 pb-12 border-l-2 border-border last:border-l-0 last:pb-0"
              >
                {/* Timeline dot */}
                <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-primary border-4 border-background" />

                <div className="glass-panel p-6 rounded-xl">
                  {/* Release header */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-4">
                    <h2 className="text-2xl font-bold">{release.title}</h2>
                    {release.major && (
                      <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full border border-primary/20 whitespace-nowrap">
                        Major update
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-muted-foreground mb-6">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">{release.date}</span>
                  </div>

                  {/* Changes */}
                  <ul className="space-y-3">
                    {release.changes.map((change) => (
                      <li key={change.text} className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <change.icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded border ${typeColors[change.type as keyof typeof typeColors]}`}>
                              {change.type}
                            </span>
                          </div>
                          <p className="text-sm text-foreground">{change.text}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
