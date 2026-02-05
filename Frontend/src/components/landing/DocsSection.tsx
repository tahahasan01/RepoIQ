import { motion } from "framer-motion";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Zap,
  Shield,
  Code2,
  GitBranch,
  FileText,
  Settings,
  Book,
  ChevronRight,
  ExternalLink,
  Search,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Documentation content with actual descriptions
const docsCategories = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Zap,
    color: "text-primary",
    articles: [
      {
        title: "Introduction to RepoIQ",
        description:
          "RepoIQ is an AI-powered code analysis platform that helps you maintain high-quality, secure, and well-documented codebases. Connect your GitHub repositories and get instant insights.",
        keyPoints: [
          "AI-powered code analysis",
          "Security vulnerability detection",
          "Automated documentation generation",
        ],
      },
      {
        title: "Connecting your GitHub",
        description:
          "Link your GitHub account with a single click using OAuth. RepoIQ securely accesses your repositories with read-only permissions by default.",
        keyPoints: [
          "One-click OAuth connection",
          "Secure token encryption",
          "Select which repos to analyze",
        ],
      },
      {
        title: "Your first scan",
        description:
          "Run your first analysis by selecting a repository and clicking 'Analyze Now'. Our AI agents will scan your code for security issues, quality problems, and documentation gaps.",
        keyPoints: [
          "Select any connected repository",
          "Analysis typically takes 30-60 seconds",
          "View results in the interactive dashboard",
        ],
      },
      {
        title: "Understanding scores",
        description:
          "Each repository receives scores across multiple dimensions: Security, Code Quality, Architecture, and Documentation. Scores range from 0-100 with higher being better.",
        keyPoints: [
          "Overall health score (0-100)",
          "Category-specific breakdowns",
          "Trend tracking over time",
        ],
      },
    ],
  },
  {
    id: "security",
    title: "Security Analysis",
    icon: Shield,
    color: "text-destructive",
    articles: [
      {
        title: "Vulnerability detection",
        description:
          "Our security agent scans for common vulnerabilities including SQL injection, XSS, command injection, and insecure configurations across all supported languages.",
        keyPoints: [
          "OWASP Top 10 coverage",
          "Language-specific patterns",
          "Severity classification (Critical/High/Medium/Low)",
        ],
      },
      {
        title: "Dependency scanning",
        description:
          "Automatically analyze your project dependencies for known CVEs and outdated packages that may introduce security risks.",
        keyPoints: [
          "CVE database matching",
          "Outdated dependency alerts",
          "Suggested upgrade paths",
        ],
      },
      {
        title: "Secret detection",
        description:
          "Detect hardcoded secrets, API keys, tokens, and credentials that should not be committed to version control.",
        keyPoints: [
          "API key pattern matching",
          "Environment variable suggestions",
          "Git history scanning",
        ],
      },
      {
        title: "Security best practices",
        description:
          "Get recommendations for security best practices specific to your tech stack, including secure coding patterns and configuration hardening.",
        keyPoints: [
          "Framework-specific guidance",
          "Secure defaults recommendations",
          "Authentication/authorization patterns",
        ],
      },
    ],
  },
  {
    id: "code-quality",
    title: "Code Quality",
    icon: Code2,
    color: "text-cyan-500",
    articles: [
      {
        title: "Code metrics",
        description:
          "Measure cyclomatic complexity, maintainability index, lines of code, and other metrics to understand your codebase health at a glance.",
        keyPoints: [
          "Cyclomatic complexity analysis",
          "Maintainability scoring",
          "Technical debt estimation",
        ],
      },
      {
        title: "Naming conventions",
        description:
          "Enforce consistent naming conventions across your codebase. Detect poorly named variables, functions, and classes that hurt readability.",
        keyPoints: [
          "Variable naming analysis",
          "Function naming patterns",
          "Consistency scoring",
        ],
      },
      {
        title: "Complexity analysis",
        description:
          "Identify overly complex functions and classes that are difficult to test, maintain, and understand. Get refactoring suggestions.",
        keyPoints: [
          "Function length analysis",
          "Nesting depth detection",
          "Refactoring recommendations",
        ],
      },
      {
        title: "Code smells",
        description:
          "Detect common code smells like dead code, duplicate code, long parameter lists, and feature envy that indicate design problems.",
        keyPoints: [
          "Dead code detection",
          "Duplication analysis",
          "Design pattern violations",
        ],
      },
    ],
  },
  {
    id: "architecture",
    title: "Architecture",
    icon: GitBranch,
    color: "text-violet-500",
    articles: [
      {
        title: "Architecture detection",
        description:
          "Automatically detect your project's architecture pattern (MVC, microservices, monolith, etc.) and visualize the module structure.",
        keyPoints: [
          "Pattern recognition (MVC, MVVM, etc.)",
          "Module dependency mapping",
          "Layer violation detection",
        ],
      },
      {
        title: "Refactoring suggestions",
        description:
          "Get AI-powered suggestions for improving your codebase architecture, including module extraction and dependency inversion opportunities.",
        keyPoints: [
          "Module extraction candidates",
          "Coupling reduction tips",
          "SOLID principle guidance",
        ],
      },
      {
        title: "Design patterns",
        description:
          "Identify where design patterns could improve your code and get implementation suggestions tailored to your specific use case.",
        keyPoints: [
          "Pattern opportunity detection",
          "Implementation examples",
          "Anti-pattern warnings",
        ],
      },
      {
        title: "Module analysis",
        description:
          "Understand how modules interact, identify circular dependencies, and optimize your project structure for maintainability.",
        keyPoints: [
          "Circular dependency detection",
          "Module cohesion scoring",
          "Import/export analysis",
        ],
      },
    ],
  },
];

const popularArticles = [
  { category: "getting-started", title: "Introduction to RepoIQ" },
  { category: "getting-started", title: "Your first scan" },
  { category: "security", title: "Vulnerability detection" },
  { category: "code-quality", title: "Code metrics" },
];

export function DocsSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("getting-started");
  const [expandedArticle, setExpandedArticle] = useState<string | null>(null);

  // Filter articles based on search
  const filteredCategories = docsCategories
    .map((cat) => ({
      ...cat,
      articles: cat.articles.filter(
        (article) =>
          article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          article.description.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter((cat) => cat.articles.length > 0);

  const handleArticleClick = (categoryId: string, articleTitle: string) => {
    const key = `${categoryId}-${articleTitle}`;
    setExpandedArticle(expandedArticle === key ? null : key);
  };

  return (
    <section id="docs" className="py-24 bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20" />

      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-12"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            Documentation &{" "}
            <span className="gradient-text">Guides</span>
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Everything you need to get the most out of RepoIQ
          </p>

          {/* Search */}
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search documentation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11"
            />
          </div>
        </motion.div>

        {/* Popular articles (when no search) */}
        {!searchQuery && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mb-10"
          >
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              Popular Articles
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {popularArticles.map((article, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setActiveTab(article.category);
                    handleArticleClick(article.category, article.title);
                  }}
                  className="glass-panel rounded-lg p-4 text-left hover:bg-primary/5 hover:border-primary/20 transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium line-clamp-1">
                      {article.title}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Tabbed documentation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="glass-panel rounded-2xl p-6 md:p-8"
        >
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full flex-wrap h-auto gap-2 bg-transparent p-0 mb-6">
              {(searchQuery ? filteredCategories : docsCategories).map((category) => (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 rounded-lg"
                >
                  <category.icon className="h-4 w-4 mr-2" />
                  {category.title}
                </TabsTrigger>
              ))}
            </TabsList>

            {(searchQuery ? filteredCategories : docsCategories).map((category) => (
              <TabsContent key={category.id} value={category.id} className="mt-0">
                <Accordion
                  type="single"
                  collapsible
                  value={expandedArticle || undefined}
                  onValueChange={(value) => setExpandedArticle(value)}
                >
                  {category.articles.map((article, index) => {
                    const itemKey = `${category.id}-${article.title}`;
                    return (
                      <AccordionItem
                        key={index}
                        value={itemKey}
                        className="border-border/50"
                      >
                        <AccordionTrigger className="hover:no-underline py-4 px-2">
                          <div className="flex items-center gap-3 text-left">
                            <div className={`w-8 h-8 rounded-lg bg-muted flex items-center justify-center`}>
                              <Book className={`h-4 w-4 ${category.color}`} />
                            </div>
                            <span className="font-medium">{article.title}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-2 pb-4">
                          <div className="pl-11 space-y-4">
                            <p className="text-muted-foreground leading-relaxed">
                              {article.description}
                            </p>
                            <div className="bg-muted/50 rounded-lg p-4">
                              <h4 className="text-sm font-semibold mb-2">
                                Key Points
                              </h4>
                              <ul className="space-y-1.5">
                                {article.keyPoints.map((point, idx) => (
                                  <li
                                    key={idx}
                                    className="flex items-center gap-2 text-sm text-muted-foreground"
                                  >
                                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                                    {point}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </TabsContent>
            ))}
          </Tabs>
        </motion.div>

        {/* View full docs link */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="text-center mt-8"
        >
          <Link to="/docs">
            <Button variant="outline" size="lg" className="gap-2">
              View Full Documentation
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
