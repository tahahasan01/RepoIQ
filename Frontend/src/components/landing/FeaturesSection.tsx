import { motion } from "framer-motion";
import {
  Shield,
  Code2,
  GitBranch,
  MessageSquare,
  FileText,
  Users,
  Gauge,
  Wand2,
} from "lucide-react";
import { ANALYSIS_MAX_FILES } from "@/content/plan";

// Only what the product does today. Check README.md before adding a card.
const features = [
  {
    icon: Shield,
    title: "Security review",
    description:
      "Claude and static checks look for injection, hardcoded secrets, missing auth checks and similar problems, each with the file, the line and a suggested fix.",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  {
    icon: Code2,
    title: "Code quality findings",
    description:
      "Long functions, deep nesting, duplication, missing error handling and other maintainability issues, graded by severity.",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: GitBranch,
    title: "Architecture and diagram",
    description:
      "Architecture findings, a prioritised improvement roadmap, and an architecture diagram generated from the file tree.",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
  {
    icon: Wand2,
    title: "Fixes as draft pull requests",
    description:
      "Pick findings and RepoIQ proposes a change. You review the exact diff, and only then does it open a draft pull request on a new branch.",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
  },
  {
    icon: FileText,
    title: "Reports",
    description:
      "A full analysis report and a bug report you can print or save as PDF, built from the latest analysis.",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  {
    icon: MessageSquare,
    title: "Ask about this repo",
    description:
      "Chat about a repository, grounded in its latest analysis. Attach up to three files to ask about specific code.",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    icon: Gauge,
    title: "Scores with history",
    description:
      "Security, quality, architecture, documentation and overall scores computed from the findings alone, with a trend across analyses.",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
  },
  {
    icon: Users,
    title: "Organisations and teams",
    description:
      "Group repositories into teams, invite people, compare teams, and get in-app alerts when a score drops below your threshold.",
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5 },
  },
};

export function FeaturesSection() {
  return (
    <section id="features" className="py-24 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30" />
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            What RepoIQ{" "}
            <span className="gradient-text">checks and does</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Every analysis reads your code from GitHub, reviews up to {ANALYSIS_MAX_FILES} files chosen by importance,
            and keeps the results so you can track them over time.
          </p>
        </motion.div>

        {/* Features grid */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="group glass-panel rounded-2xl p-6 hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
            >
              <div
                className={`w-12 h-12 rounded-xl ${feature.bgColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}
              >
                <feature.icon className={`h-6 w-6 ${feature.color}`} />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
