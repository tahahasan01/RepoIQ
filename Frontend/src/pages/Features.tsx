import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Shield, Code2, GitBranch, BarChart3, FileText, Zap, Users, Lock, Bell, RefreshCw } from "lucide-react";
import { useEffect } from "react";

const features = [
  {
    icon: Shield,
    title: "Security Analysis",
    description: "Detect vulnerabilities, exposed secrets, and security risks across your entire codebase with advanced pattern matching.",
    benefits: ["SQL injection detection", "XSS vulnerability scanning", "Secret exposure alerts", "Dependency vulnerability checks"]
  },
  {
    icon: Code2,
    title: "Code Quality Metrics",
    description: "Track code complexity, maintainability, and technical debt with actionable insights and recommendations.",
    benefits: ["Cyclomatic complexity analysis", "Code duplication detection", "Best practices enforcement", "Maintainability index"]
  },
  {
    icon: GitBranch,
    title: "Architecture Review",
    description: "Understand your codebase structure, dependencies, and design patterns to make informed architectural decisions.",
    benefits: ["Dependency graph visualization", "Architecture pattern detection", "Circular dependency alerts", "Module cohesion analysis"]
  },
  {
    icon: FileText,
    title: "Smart Documentation",
    description: "Auto-generate comprehensive documentation from your code, including API references and usage examples.",
    benefits: ["API documentation generation", "Code comment analysis", "Usage example extraction", "README quality scoring"]
  },
  {
    icon: BarChart3,
    title: "Real-time Analytics",
    description: "Monitor code quality trends, team performance, and project health with beautiful, interactive dashboards.",
    benefits: ["Quality trend tracking", "Team performance metrics", "Custom KPI dashboards", "Historical comparisons"]
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Enable your team to work together on code quality with shared insights, comments, and improvement plans.",
    benefits: ["Team workspaces", "Shared analysis reports", "Collaborative issue tracking", "Role-based access control"]
  },
  {
    icon: Bell,
    title: "Smart Notifications",
    description: "Get alerted to critical issues, quality regressions, and security vulnerabilities as they happen.",
    benefits: ["Critical issue alerts", "Quality regression detection", "Custom notification rules", "Slack/Email integration"]
  },
  {
    icon: RefreshCw,
    title: "Continuous Monitoring",
    description: "Automatically analyze every commit and pull request to maintain code quality standards.",
    benefits: ["GitHub webhook integration", "PR quality checks", "Automated code reviews", "CI/CD pipeline integration"]
  },
  {
    icon: Lock,
    title: "Enterprise Security",
    description: "Keep your code private with end-to-end encryption, SSO, and compliance-ready infrastructure.",
    benefits: ["AES-256 encryption", "SSO support", "SOC 2 compliance", "Private cloud deployment"]
  },
  {
    icon: Zap,
    title: "Lightning Fast",
    description: "Analyze repositories of any size in seconds with our optimized parallel processing engine.",
    benefits: ["Sub-60 second analysis", "Parallel processing", "Incremental analysis", "Smart caching"]
  }
];

export default function Features() {
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
              Powerful Features for{" "}
              <span className="gradient-text">Modern Teams</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Everything you need to maintain high code quality, security, and team productivity.
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
                transition={{ duration: 0.5, delay: index * 0.1 }}
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
                        <li key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
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
            className="glass-panel p-12 rounded-2xl max-w-3xl mx-auto"
          >
            <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
            <p className="text-muted-foreground mb-8">
              Join thousands of teams using RepoIQ to ship better code faster.
            </p>
            <a
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Start Free Trial
            </a>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
