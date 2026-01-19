import { motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import {
  Search,
  Book,
  Zap,
  Shield,
  Code2,
  GitBranch,
  FileText,
  Settings,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { Input } from "@/components/ui/input";

const docsSections = [
  {
    title: "Getting Started",
    icon: Zap,
    articles: [
      { title: "Introduction to RepoIQ", slug: "introduction" },
      { title: "Connecting your GitHub", slug: "connect-github" },
      { title: "Your first scan", slug: "first-scan" },
      { title: "Understanding scores", slug: "scores" },
    ],
  },
  {
    title: "Security Analysis",
    icon: Shield,
    articles: [
      { title: "Vulnerability detection", slug: "vulnerabilities" },
      { title: "Dependency scanning", slug: "dependencies" },
      { title: "Secret detection", slug: "secrets" },
      { title: "Security best practices", slug: "security-best-practices" },
    ],
  },
  {
    title: "Code Quality",
    icon: Code2,
    articles: [
      { title: "Code metrics", slug: "metrics" },
      { title: "Naming conventions", slug: "naming" },
      { title: "Complexity analysis", slug: "complexity" },
      { title: "Code smells", slug: "code-smells" },
    ],
  },
  {
    title: "Architecture",
    icon: GitBranch,
    articles: [
      { title: "Architecture detection", slug: "architecture-detection" },
      { title: "Refactoring suggestions", slug: "refactoring" },
      { title: "Design patterns", slug: "patterns" },
      { title: "Module analysis", slug: "modules" },
    ],
  },
  {
    title: "Documentation",
    icon: FileText,
    articles: [
      { title: "Auto-generated docs", slug: "auto-docs" },
      { title: "README generation", slug: "readme" },
      { title: "API documentation", slug: "api-docs" },
      { title: "Diagram generation", slug: "diagrams" },
    ],
  },
  {
    title: "Configuration",
    icon: Settings,
    articles: [
      { title: "Configuration file", slug: "config" },
      { title: "Ignore patterns", slug: "ignore" },
      { title: "Custom rules", slug: "custom-rules" },
      { title: "Webhooks & API", slug: "webhooks" },
    ],
  },
];

const popularArticles = [
  "Introduction to RepoIQ",
  "Your first scan",
  "Understanding scores",
  "Vulnerability detection",
];

export default function Docs() {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSections = docsSections.map((section) => ({
    ...section,
    articles: section.articles.filter((article) =>
      article.title.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((section) => section.articles.length > 0);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-3xl mx-auto mb-12"
          >
            <h1 className="text-4xl sm:text-5xl font-bold mb-4">
              <span className="gradient-text">Documentation</span>
            </h1>
            <p className="text-lg text-muted-foreground mb-8">
              Everything you need to get the most out of RepoIQ
            </p>
            
            {/* Search */}
            <div className="relative max-w-xl mx-auto">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 text-lg"
              />
            </div>
          </motion.div>

          {/* Quick links */}
          {!searchQuery && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mb-12"
            >
              <h2 className="text-lg font-semibold mb-4">Popular Articles</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {popularArticles.map((article, index) => (
                  <a
                    key={index}
                    href="#"
                    className="glass-panel rounded-lg p-4 hover:bg-primary/5 transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{article}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </a>
                ))}
              </div>
            </motion.div>
          )}

          {/* Documentation sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSections.map((section, index) => (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                className="glass-panel rounded-xl p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <section.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold">{section.title}</h3>
                </div>
                <ul className="space-y-2">
                  {section.articles.map((article) => (
                    <li key={article.slug}>
                      <a
                        href={`#${article.slug}`}
                        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
                      >
                        <Book className="h-3 w-3" />
                        {article.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>

          {/* API Reference */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-12 glass-panel rounded-xl p-8 text-center"
          >
            <h2 className="text-2xl font-bold mb-2">API Reference</h2>
            <p className="text-muted-foreground mb-6">
              Integrate RepoIQ into your workflow with our comprehensive API
            </p>
            <a
              href="#api"
              className="inline-flex items-center gap-2 text-primary hover:underline"
            >
              View API Documentation
              <ExternalLink className="h-4 w-4" />
            </a>
          </motion.div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
