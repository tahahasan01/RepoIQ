import { motion, type Variants } from "framer-motion";
import { Link } from "react-router-dom";
import { Lock, ShieldCheck, Eye, Server, KeyRound, GitPullRequest } from "lucide-react";

// A summary of src/pages/Security.tsx. Keep the two in step: nothing here may
// claim more than that page does.
const securityFeatures = [
  {
    icon: KeyRound,
    title: "Limited GitHub access",
    description:
      "RepoIQ is a GitHub App installed only on the repositories you choose. Its GitHub tokens are short-lived or encrypted, and never sent to your browser.",
    highlights: [
      "You pick which repositories it can read",
      "Installation tokens expire after one hour",
      "Stored tokens encrypted with AES-256-GCM",
    ],
  },
  {
    icon: Eye,
    title: "What RepoIQ keeps",
    description:
      "Code is fetched from GitHub when you ask for an analysis, a chat answer or a fix. RepoIQ stores results, not a copy of your repository.",
    highlights: [
      "File contents cached for up to 30 minutes",
      "Per-file findings cached for up to 30 days",
      "Findings, chat and auto-fix proposals kept until you delete them",
    ],
  },
  {
    icon: GitPullRequest,
    title: "Nothing changes without you",
    description:
      "Each account reaches only its own data, and RepoIQ writes to GitHub only for a fix you have reviewed and approved.",
    highlights: [
      "Auto-fix opens a draft pull request after you approve the diff",
      "Joining a team requires accepting an invitation",
      "A test fails the build if a query skips its ownership check",
    ],
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

export function SecuritySection() {
  return (
    <section id="security" className="py-24 relative overflow-hidden">
      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-primary/5" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20" />
      
      {/* Decorative elements */}
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
            <Lock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Security</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            How RepoIQ handles{" "}
            <span className="gradient-text">your code</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            What RepoIQ can reach on GitHub, what it stores, and what it never does without your
            approval.
          </p>
        </motion.div>

        {/* Security cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8"
        >
          {securityFeatures.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="group relative"
            >
              {/* Card */}
              <div className="glass-panel rounded-2xl p-8 h-full border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5">
                {/* Icon container with gradient border effect */}
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <feature.icon className="h-8 w-8 text-primary" />
                  </div>
                  {/* Subtle glow on hover */}
                  <div className="absolute inset-0 w-16 h-16 rounded-xl bg-primary/20 blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
                </div>

                {/* Title */}
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>

                {/* Description */}
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  {feature.description}
                </p>

                {/* Highlights */}
                <ul className="space-y-2">
                  {feature.highlights.map((highlight, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-8 text-muted-foreground"
        >
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            <span className="text-sm">HTTPS with HSTS in production</span>
          </div>
          <div className="w-px h-6 bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm">Code not used to train AI models</span>
          </div>
          <div className="w-px h-6 bg-border hidden sm:block" />
          <Link to="/security" className="flex items-center gap-2 hover:text-foreground transition-colors">
            <Lock className="h-5 w-5" />
            <span className="text-sm underline-offset-4 hover:underline">Read the full security page</span>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
