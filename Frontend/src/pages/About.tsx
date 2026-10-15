import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Target, User, Gauge, GitPullRequest, KeyRound } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";

// Facts only: who builds RepoIQ (README.md, "Author") and how it works. No
// invented team, customers, numbers or company history.
const OWNER_GITHUB_URL = "https://github.com/tahahasan01";

export default function About() {
  useEffect(() => {
    document.title = "About - RepoIQ";
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <main className="pt-24 pb-16">
        {/* Hero */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              About <span className="gradient-text">RepoIQ</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              RepoIQ is an AI code review tool for GitHub repositories, built by Taha Hasan.
            </p>
          </motion.div>
        </section>

        {/* What and who */}
        <section className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="glass-panel p-8 rounded-2xl"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-4">What it does</h2>
              <p className="text-muted-foreground">
                RepoIQ reads a repository with Claude and static checks, and reports security, quality, architecture
                and documentation findings with the file and line. It scores the repository from those findings,
                answers questions about the code, and can propose fixes as draft pull requests that you approve
                first.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="glass-panel p-8 rounded-2xl"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <User className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Who builds it</h2>
              <p className="text-muted-foreground">
                RepoIQ is built by Taha Hasan,{" "}
                <a
                  href={OWNER_GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link hover:underline"
                >
                  @tahahasan01
                </a>{" "}
                on GitHub. It is free to use and under active development.
              </p>
            </motion.div>
          </div>
        </section>

        {/* How it's built */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="max-w-3xl mx-auto glass-panel p-6 md:p-12 rounded-2xl"
          >
            <h2 className="text-3xl font-bold mb-6 text-center">How it's built</h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                The web app is React. The API is FastAPI on PostgreSQL, with Redis for caching and rate limits and
                Celery workers that run analyses, auto-fixes and webhook deliveries in the background.
              </p>
              <p>
                Code review, chat, roadmaps, diagrams and fixes use Claude through Anthropic's API. RepoIQ reaches
                GitHub through a GitHub App, installed only on the repositories you choose, with short-lived
                tokens.
              </p>
              <p>
                How your data is handled is set out on the <Link to="/security" className="text-link hover:underline">Security</Link>{" "}
                and <Link to="/privacy" className="text-link hover:underline">Privacy</Link> pages.
              </p>
            </div>
          </motion.div>
        </section>

        {/* Principles */}
        <section className="container mx-auto px-4 py-12">
          <h2 className="text-3xl font-bold text-center mb-12">Design principles</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Gauge,
                title: "Scores you can explain",
                description:
                  "A score is computed from the findings alone, never from the model's opinion, so you can always see what produced it.",
              },
              {
                icon: GitPullRequest,
                title: "You approve every change",
                description:
                  "Auto-fix opens a draft pull request only after you have reviewed the exact diff, and never pushes to an existing branch.",
              },
              {
                icon: KeyRound,
                title: "Only the access it needs",
                description:
                  "The GitHub App sees only the repositories you pick, and writes only for fixes you approve.",
              },
            ].map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
                className="glass-panel p-6 rounded-xl text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <value.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{value.title}</h3>
                <p className="text-sm text-muted-foreground">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="text-center"
          >
            <h2 className="text-3xl font-bold mb-4">Questions or feedback?</h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              Feedback on findings, scores or anything else is welcome.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/contact"
                className="px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                Contact RepoIQ
              </Link>
              <Link
                to="/docs"
                className="px-8 py-3 border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Read the documentation
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
