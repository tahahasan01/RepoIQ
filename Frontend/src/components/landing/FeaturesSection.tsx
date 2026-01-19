import { motion } from "framer-motion";
import {
  Shield,
  Code2,
  GitBranch,
  Sparkles,
  FileText,
  TestTube,
  Gauge,
  Wand2,
} from "lucide-react";

const features = [
  {
    icon: Shield,
    title: "Security Vulnerabilities",
    description:
      "Detect security flaws, dependency risks, and potential exploits before they reach production.",
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
  {
    icon: Code2,
    title: "Code Quality Analysis",
    description:
      "Evaluate naming conventions, code smells, complexity metrics, and best practices.",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    icon: GitBranch,
    title: "Architecture Detection",
    description:
      "Understand your codebase structure and get refactoring suggestions for better maintainability.",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
  {
    icon: Wand2,
    title: "AI-Generated Fixes",
    description:
      "Get intelligent code suggestions and one-click fixes powered by advanced AI models.",
    color: "text-violet-500",
    bgColor: "bg-violet-500/10",
  },
  {
    icon: FileText,
    title: "Auto Documentation",
    description:
      "Generate README files, docstrings, and architecture diagrams automatically.",
    color: "text-emerald-500",
    bgColor: "bg-emerald-500/10",
  },
  {
    icon: TestTube,
    title: "Test Coverage Insights",
    description:
      "Analyze test coverage gaps and get suggestions for missing test cases.",
    color: "text-amber-500",
    bgColor: "bg-amber-500/10",
  },
  {
    icon: Gauge,
    title: "Repository Scoring",
    description:
      "Get an overall health score for each repository with detailed breakdowns.",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
  },
  {
    icon: Sparkles,
    title: "Trend Analysis",
    description:
      "Track code quality over time and visualize improvements with rich charts.",
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
            Everything You Need for{" "}
            <span className="gradient-text">Code Excellence</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Comprehensive analysis tools to ensure your code is secure, maintainable, and well-documented.
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
