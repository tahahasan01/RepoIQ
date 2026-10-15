import { useEffect } from "react";
import { motion } from "framer-motion";
import { Check, Info, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ANALYSIS_MAX_FILES, DAILY_AI_ALLOWANCE, FREE_PLAN } from "@/content/plan";
import { CONTACT_EMAIL } from "@/content/legal";

const faqs = [
  {
    question: "Is RepoIQ really free?",
    answer:
      "Yes. There is one plan and it costs nothing. RepoIQ has no paid plans, no trials and never asks for payment details.",
  },
  {
    question: "What happens when I reach the daily AI allowance?",
    answer: `Analysis, chat and auto-fix all use Claude, and together they can use up to ${DAILY_AI_ALLOWANCE} model tokens per account per day. When you reach it, new AI requests are refused with a message until the allowance resets at midnight UTC. Your existing results stay available.`,
  },
  {
    question: "Does RepoIQ read my whole repository?",
    answer: `Each analysis reviews up to ${ANALYSIS_MAX_FILES} files, chosen by importance, and records how many files were eligible and how many were read. Treat the score as a verdict on what was reviewed. Files that have not changed since the last analysis are not sent to the model again.`,
  },
  {
    question: "Does RepoIQ keep a copy of my code?",
    answer:
      "No. Code is fetched from GitHub when you ask for an analysis, a chat answer or a fix. File contents are cached for up to 30 minutes. RepoIQ stores the results: findings, scores, chat messages and auto-fix proposals.",
  },
];

export default function Pricing() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    document.title = "RepoIQ — Pricing";
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              One plan, <span className="gradient-text">and it's free</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              Every account gets every feature. The only limits are the ones listed on the plan.
            </p>
          </motion.div>

          {/* Plan */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="relative glass-panel rounded-2xl p-8 max-w-xl mx-auto ring-2 ring-primary"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-xl font-bold">{FREE_PLAN.name}</h2>
            </div>

            <div className="mb-2">
              <span className="text-4xl font-bold">{FREE_PLAN.price}</span>
            </div>
            <p className="text-sm text-muted-foreground mb-6">{FREE_PLAN.description}</p>

            <Link to={isAuthenticated ? "/repos" : "/signup"}>
              <Button variant="hero" className="w-full mb-6">
                {isAuthenticated ? "Open your repositories" : "Sign up with GitHub"}
              </Button>
            </Link>

            <ul className="space-y-3">
              {FREE_PLAN.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm">
                  <Check className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                  {feature}
                </li>
              ))}
            </ul>

            <ul className="mt-6 pt-6 border-t border-border space-y-3">
              {FREE_PLAN.limits.map((limit) => (
                <li key={limit} className="flex items-start gap-3 text-sm text-muted-foreground">
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  {limit}
                </li>
              ))}
            </ul>
          </motion.div>

          {/* FAQ */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-3xl mx-auto mt-20"
            aria-labelledby="pricing-faq"
          >
            <h2 id="pricing-faq" className="text-2xl font-bold mb-6 text-center">
              Questions
            </h2>
            <div className="space-y-4">
              {faqs.map((faq) => (
                <div key={faq.question} className="glass-panel rounded-xl p-6">
                  <h3 className="font-semibold mb-2">{faq.question}</h3>
                  <p className="text-sm text-muted-foreground">{faq.answer}</p>
                </div>
              ))}
            </div>
          </motion.section>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center mt-16"
          >
            <p className="text-muted-foreground">
              Something else?{" "}
              <Link to="/docs" className="text-link hover:underline">
                Read the documentation
              </Link>{" "}
              or email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-link hover:underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
