import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Shield, Lock, Eye, Server, KeyRound, FileCheck, Gauge, CheckCircle } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import {
  LEGAL_DOCS_ARE_DRAFTS,
  PRODUCT_NAME,
  SECURITY_ACK_TIME,
  SECURITY_EMAIL,
} from "@/content/legal";

const securityFeatures = [
  {
    icon: Lock,
    title: "Protected GitHub credentials",
    description:
      "The credentials that let RepoIQ act on GitHub for you are encrypted or short-lived, and never sent to your browser.",
    details: [
      "OAuth access tokens are encrypted with AES-256-GCM before they are stored",
      "Production refuses to start without a dedicated token encryption key, separate from the session signing key",
      "In GitHub App mode, access tokens expire after one hour and no long-lived user token is stored",
      "GitHub tokens are never included in API responses",
    ],
  },
  {
    icon: Eye,
    title: "Source code handling",
    description:
      "Code is fetched from GitHub when you ask for an analysis, a chat answer or a fix. RepoIQ does not keep a copy of your repository.",
    details: [
      "File contents are cached for up to 30 minutes",
      "Per-file findings are cached for up to 30 days so unchanged files are not sent to the AI again",
      "Findings, chat messages and auto-fix proposals are stored until you delete them",
      "RepoIQ does not use your code to train AI models",
    ],
  },
  {
    icon: Server,
    title: "Transport and browser protections",
    description:
      "Traffic is served over HTTPS in production, and responses carry headers that limit what a browser will do with them.",
    details: [
      "Strict-Transport-Security (HSTS) on API and web responses in production",
      "Content-Security-Policy, X-Frame-Options: DENY and X-Content-Type-Options: nosniff",
      "Restrictive Referrer-Policy and Permissions-Policy headers",
      "Interactive API documentation is off in production by default",
    ],
  },
  {
    icon: KeyRound,
    title: "Access control",
    description: "Each account can reach only its own data, and joining a team requires consent.",
    details: [
      "Sign in with GitHub; sessions expire, and signing out revokes them on the server",
      "Each request checks that the repository belongs to your account",
      "An automated test fails the build if a data query is missing an ownership check",
      "You join a team only by accepting an invitation; user search does not reveal email addresses",
    ],
  },
  {
    icon: FileCheck,
    title: "Auto-fix safeguards",
    description: "AI-proposed changes reach GitHub only after you have reviewed and approved the exact diff.",
    details: [
      "Nothing is pushed until you approve, and the published changes must match what you reviewed",
      "Requires your own write access on GitHub, checked again when the change is published",
      "Opened as a draft pull request on a new branch; never committed to an existing branch",
      "Changes containing hidden Unicode characters, or touching CI and build files, are refused",
    ],
  },
  {
    icon: Gauge,
    title: "Abuse and cost limits",
    description: "Limits protect the service and other users from runaway or abusive use.",
    details: [
      "Rate limiting on API requests, which keeps working if the cache is unavailable",
      "A daily AI usage budget per user",
      "Webhook destinations must use HTTPS and cannot point at private or internal network addresses",
      "Webhook payloads are signed with HMAC-SHA256 so receivers can verify them",
    ],
  },
];

const practices = [
  {
    title: "Least-privilege GitHub access",
    description:
      "RepoIQ can run as a GitHub App, which lets you choose the repositories it can see and limits it to repository contents, metadata, pull requests and your email address. In OAuth mode GitHub's repo scope is needed to read private repositories, and it also grants write access. Either way, RepoIQ writes to GitHub only for auto-fix pull requests you approve.",
  },
  {
    title: "Safe production configuration",
    description:
      "The backend refuses to start in production with debug mode on, a weak or placeholder signing key, a missing encryption key, a non-HTTPS GitHub callback URL, or an allowed browser origin that is not a public HTTPS address.",
  },
  {
    title: "Automated checks on every change",
    description:
      "Backend and frontend tests, type checks and linting run in continuous integration, including a static check that every query against customer data is scoped to its owner.",
  },
  {
    title: "Data minimization",
    description:
      "Code is fetched on demand and cached briefly. We store analysis results, not repositories. Deleting your account removes your data as described in the Privacy Policy.",
  },
  {
    title: "Third-party providers",
    description:
      "Code sent for analysis goes to Anthropic, our AI provider, through its commercial API. Our application, database and cache run on our hosting providers. The Privacy Policy lists who receives what.",
  },
  {
    title: "Incident response",
    description:
      "If we learn of a security incident affecting your data, we will investigate, contain it, and notify affected users without undue delay and as the law requires.",
  },
];

export default function Security() {
  useEffect(() => {
    document.title = "Security - RepoIQ";
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
            className="text-center mb-12"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              <span className="gradient-text">Security</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              How {PRODUCT_NAME} protects your account, your GitHub access and your code, and how to report a
              vulnerability.
            </p>
            {LEGAL_DOCS_ARE_DRAFTS && (
              <p className="mt-6 inline-block rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-600 dark:text-amber-400">
                Draft. This page is pending review and may change before launch.
              </p>
            )}
          </motion.div>
        </section>

        {/* Security measures */}
        <section className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {securityFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className="glass-panel p-6 rounded-xl"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground text-sm mb-4">{feature.description}</p>
                <ul className="space-y-2">
                  {feature.details.map((detail) => (
                    <li key={detail} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Certifications */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="max-w-4xl mx-auto glass-panel p-6 md:p-12 rounded-2xl"
          >
            <h2 className="text-3xl font-bold mb-6 text-center">Certifications and compliance</h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                {PRODUCT_NAME} does not currently hold any security certification, such as SOC 2 or ISO 27001.
                We will update this page if that changes.
              </p>
              <p>
                How we handle personal information, which providers receive it, and how to exercise your rights
                are described in our{" "}
                <Link to="/privacy" className="text-link hover:underline">Privacy Policy</Link>.
              </p>
            </div>
          </motion.div>
        </section>

        {/* Security practices */}
        <section className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-12 text-center">Our security practices</h2>
            <div className="space-y-6">
              {practices.map((practice, index) => (
                <motion.div
                  key={practice.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 1 + index * 0.1 }}
                  className="glass-panel p-6 rounded-xl"
                >
                  <h3 className="text-lg font-semibold mb-2">{practice.title}</h3>
                  <p className="text-muted-foreground text-sm">{practice.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Responsible disclosure */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.6 }}
            className="max-w-3xl mx-auto glass-panel p-6 md:p-12 rounded-2xl"
          >
            <h2 className="text-3xl font-bold mb-4 text-center">Responsible disclosure</h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                If you believe you have found a security vulnerability in {PRODUCT_NAME}, please email{" "}
                <a href={`mailto:${SECURITY_EMAIL}`} className="text-link hover:underline">{SECURITY_EMAIL}</a>{" "}
                with a description of the issue and the steps to reproduce it. We aim to acknowledge reports
                within {SECURITY_ACK_TIME}.
              </p>
              <p>When testing, please:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>use only accounts and repositories you own, and never access another user's data;</li>
                <li>avoid degrading the service for others, for example through load testing or spam;</li>
                <li>give us reasonable time to fix the issue before disclosing it publicly.</li>
              </ul>
              <p>We will not pursue action against good-faith research that follows these guidelines.</p>
            </div>
            <div className="text-center mt-8">
              <a
                href={`mailto:${SECURITY_EMAIL}`}
                className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                Report a vulnerability
              </a>
            </div>
          </motion.div>
        </section>

        {/* Contact */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.8 }}
            className="text-center"
          >
            <h2 className="text-2xl font-bold mb-4">Questions about security?</h2>
            <p className="text-muted-foreground mb-8">
              Email{" "}
              <a href={`mailto:${SECURITY_EMAIL}`} className="text-link hover:underline">{SECURITY_EMAIL}</a>{" "}
              or use the contact page.
            </p>
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Contact us
            </Link>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
