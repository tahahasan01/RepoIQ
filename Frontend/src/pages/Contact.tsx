import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Mail, BookOpen, Github, ShieldAlert } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { CONTACT_EMAIL, SECURITY_EMAIL } from "@/content/legal";

/** The public source repository (README.md, "Author"). */
const GITHUB_REPO_URL = "https://github.com/tahahasan01/RepoIQ";

export default function Contact() {
  useEffect(() => {
    document.title = "Contact - RepoIQ";
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
              Get in <span className="gradient-text">touch</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Questions, problems and requests about your data all go to one email address.
            </p>
          </motion.div>
        </section>

        {/* Contact Grid */}
        <section className="container mx-auto px-4">
          <div className="grid lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Email */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="lg:col-span-2 glass-panel p-8 rounded-2xl"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-6">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Email</h2>
              <p className="text-muted-foreground mb-6">
                For questions about RepoIQ, problems with your account, or requests about your data, email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-link hover:underline break-all">
                  {CONTACT_EMAIL}
                </a>
                . If something went wrong, include the repository name and what you were doing.
              </p>
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("RepoIQ")}`}
                className="inline-flex items-center justify-center gap-2 w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                <Mail className="h-4 w-4" />
                Write an email
              </a>
            </motion.div>

            {/* Other ways */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="space-y-6"
            >
              <div className="glass-panel p-6 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Documentation</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  How analysis, scores, auto-fix, teams, alerts and webhooks work.
                </p>
                <Link to="/docs" className="text-link hover:underline">
                  Read the documentation
                </Link>
              </div>

              <div className="glass-panel p-6 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <ShieldAlert className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Security reports</h3>
                <p className="text-sm text-muted-foreground mb-2">
                  Found a vulnerability? Email it privately rather than posting it in public.
                </p>
                <a href={`mailto:${SECURITY_EMAIL}`} className="text-link hover:underline break-all">
                  {SECURITY_EMAIL}
                </a>
              </div>

              <div className="glass-panel p-6 rounded-xl">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <Github className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Source code</h3>
                <p className="text-sm text-muted-foreground mb-2">RepoIQ's repository on GitHub.</p>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-link hover:underline break-all"
                >
                  github.com/tahahasan01/RepoIQ
                </a>
              </div>
            </motion.div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
