import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import {
  Shield,
  Code2,
  GitBranch,
  BarChart3,
  FileText,
  Users,
  Lock,
  Bell,
  RefreshCw,
  MessageSquare,
  Wand2,
  ListFilter,
} from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  ANALYSIS_MAX_FILES,
  AUTOFIX_MAX_FILES,
  AUTOFIX_MAX_FINDINGS,
  CHAT_MAX_FILES,
} from "@/content/plan";

// Every card describes something the product does today (see README.md).
// RepoIQ does not scan dependencies for known vulnerabilities, run on every
// commit, integrate with CI, send email or Slack messages, or support SSO.
const features = [
  {
    icon: Shield,
    title: "Security review",
    description:
      "Claude reviews your source alongside static checks for well-understood patterns. Every finding has a severity, the file, the real line number and a suggested fix.",
    benefits: [
      "SQL, command and path injection",
      "Hardcoded passwords, API keys and tokens",
      "Missing input validation, authentication or authorization",
      "Cross-site scripting (XSS)",
    ],
  },
  {
    icon: Code2,
    title: "Code quality findings",
    description: "Maintainability problems a reviewer would point out, graded by severity so you can start with what matters.",
    benefits: [
      "Long functions and deep nesting",
      "Duplication and magic numbers",
      "Missing error handling",
      "Unused imports and variables",
    ],
  },
  {
    icon: GitBranch,
    title: "Architecture review",
    description: "Findings about how the code is put together, plus a plan for improving it.",
    benefits: [
      "Tight coupling and missing separation of concerns",
      "Hardcoded configuration",
      "A prioritised improvement roadmap",
      "An architecture diagram generated from the file tree",
    ],
  },
  {
    icon: FileText,
    title: "Documentation and reports",
    description: "Documentation findings, and reports built from the latest analysis that you can print or save as PDF.",
    benefits: [
      "Public code with no docstring or comment where its behaviour isn't evident",
      "Full analysis report",
      "Bug report",
      "Roadmap and architecture diagram on the Documentation tab",
    ],
  },
  {
    icon: BarChart3,
    title: "Scores with history",
    description:
      "Scores are computed from the findings alone, never from the model's opinion, so every score can be explained by the list that produced it.",
    benefits: [
      "Security, quality, architecture, documentation and overall scores",
      "The overall score is capped at 15 points above the weakest area",
      "Analysis history and a score trend per repository",
      "Each analysis records how many files were eligible and how many were read",
    ],
  },
  {
    icon: ListFilter,
    title: "Issues and files",
    description: "Work through findings as a list, or see them against the code they refer to.",
    benefits: [
      "Search issues and filter by severity and type",
      "Browse the file tree with findings marked",
      "Open a finding to see its suggested fix",
      "Select findings to fix with AI",
    ],
  },
  {
    icon: MessageSquare,
    title: "Ask about this repo",
    description: "A chat about one repository, grounded in its latest analysis.",
    benefits: [
      "Answers draw on the repository's findings and scores",
      `Attach up to ${CHAT_MAX_FILES} files to ask about specific code`,
      "The conversation is saved with the repository until you clear it",
      "Uses the same daily AI allowance as analysis",
    ],
  },
  {
    icon: Wand2,
    title: "Auto-fix as draft pull requests",
    description:
      "Select findings and RepoIQ proposes changes. Nothing reaches GitHub until you have reviewed and approved the exact diff.",
    benefits: [
      `Up to ${AUTOFIX_MAX_FINDINGS} findings across ${AUTOFIX_MAX_FILES} files per run`,
      "Opens a draft pull request on a new repoiq/fix-… branch, never an existing one",
      "Requires your own write access to the repository",
      "Refuses changes far from the selected findings, to CI and build files, or containing hidden Unicode",
    ],
  },
  {
    icon: Users,
    title: "Organisations and teams",
    description: "Group repositories under organisations and teams to see how each part of your codebase is doing.",
    benefits: [
      "Invite people; they join only by accepting the invitation",
      "Assign repositories to teams",
      "Compare teams side by side",
      "An executive dashboard for each organisation",
    ],
  },
  {
    icon: Bell,
    title: "Alerts and webhooks",
    description:
      "In-app alerts for repositories in your organisations, and signed webhooks to an HTTPS endpoint you run.",
    benefits: [
      "Alert when a score drops below your own threshold (60 by default)",
      "Alert when an analysis finds critical security issues",
      "Webhooks for analysis completed and analysis failed, signed with HMAC-SHA256",
      "Delivery history, with automatic retries",
    ],
  },
  {
    icon: RefreshCw,
    title: "Fast re-analysis",
    description: "Findings are cached per file by Git blob SHA, so files that have not changed are not sent to the model again.",
    benefits: [
      `Up to ${ANALYSIS_MAX_FILES} files reviewed per analysis, chosen by importance`,
      "Live progress while an analysis runs",
      "Re-analysing an unchanged repository is quick",
      "Same findings, same score, whether a run was cached or not",
    ],
  },
  {
    icon: Lock,
    title: "GitHub App access",
    description: "Sign in with GitHub and install the RepoIQ GitHub App on only the repositories you want reviewed.",
    benefits: [
      "Choose repositories during installation, and change them on GitHub at any time",
      "Short-lived installation tokens; stored tokens encrypted with AES-256-GCM",
      "Write access is used only for auto-fix pull requests you approve",
      "GitHub is the only way to sign in",
    ],
  },
];

export default function Features() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    document.title = "Features - RepoIQ";
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-16">
        {/* Header */}
        <section className="container mx-auto px-4 py-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              What RepoIQ{" "}
              <span className="gradient-text">does</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              AI code review for GitHub repositories: findings you can act on, scores you can explain, and
              fixes that wait for your approval.
            </p>
          </motion.div>
        </section>

        {/* Features Grid */}
        <section className="container mx-auto px-4 py-8">
          <div className="grid md:grid-cols-2 gap-8">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: Math.min(index, 6) * 0.08 }}
                className="glass-panel p-8 rounded-2xl hover:shadow-xl transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl bg-primary/10 text-primary">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground mb-4">{feature.description}</p>
                    <ul className="space-y-2">
                      {feature.benefits.map((benefit) => (
                        <li key={benefit} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                          {benefit}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="glass-panel p-6 md:p-12 rounded-2xl max-w-3xl mx-auto"
          >
            <h2 className="text-3xl font-bold mb-4">Try it on one of your repositories</h2>
            <p className="text-muted-foreground mb-8">
              RepoIQ is free. Sign up with GitHub, choose the repositories it can see, and start an analysis.
            </p>
            <Link
              to={isAuthenticated ? "/repos" : "/signup"}
              className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              {isAuthenticated ? "Open your repositories" : "Sign up with GitHub"}
            </Link>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
