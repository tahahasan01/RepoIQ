import { motion } from "framer-motion";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search,
  Star,
  GitFork,
  Calendar,
  Filter,
  Zap,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/ThemeToggle";

// Mock repositories data
const mockRepos = [
  {
    id: 1,
    name: "Dashboard",
    language: "TypeScript",
    stars: 1234,
    forks: 234,
    updatedAt: "2 hours ago",
    description: "A modern dashboard with charts and analytics",
    isPrivate: false,
    lastScan: "Yesterday",
    score: 87,
  },
  {
    id: 2,
    name: "api-gateway",
    language: "Go",
    stars: 892,
    forks: 156,
    updatedAt: "5 hours ago",
    description: "High-performance API gateway with rate limiting",
    isPrivate: true,
    lastScan: null,
    score: null,
  },
  {
    id: 3,
    name: "ml-pipeline",
    language: "Python",
    stars: 456,
    forks: 89,
    updatedAt: "1 day ago",
    description: "Machine learning data processing pipeline",
    isPrivate: false,
    lastScan: "3 days ago",
    score: 72,
  },
  {
    id: 4,
    name: "mobile-app",
    language: "Dart",
    stars: 321,
    forks: 45,
    updatedAt: "3 days ago",
    description: "Cross-platform mobile application",
    isPrivate: true,
    lastScan: null,
    score: null,
  },
  {
    id: 5,
    name: "design-system",
    language: "TypeScript",
    stars: 567,
    forks: 78,
    updatedAt: "1 week ago",
    description: "Company-wide design system and component library",
    isPrivate: false,
    lastScan: "1 week ago",
    score: 94,
  },
  {
    id: 6,
    name: "auth-service",
    language: "Rust",
    stars: 234,
    forks: 34,
    updatedAt: "2 weeks ago",
    description: "Authentication and authorization microservice",
    isPrivate: true,
    lastScan: "2 weeks ago",
    score: 81,
  },
];

const languageColors: Record<string, string> = {
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-500",
  Python: "bg-green-500",
  Go: "bg-cyan-500",
  Rust: "bg-orange-500",
  Dart: "bg-sky-400",
};

export default function Repositories() {
  const [searchQuery, setSearchQuery] = useState("");
  const [repos] = useState(mockRepos);
  const navigate = useNavigate();

  const filteredRepos = repos.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAnalyze = (repoId: number) => {
    navigate(`/dashboard/${repoId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-panel border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">
              Repo<span className="gradient-text">IQ</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-cyan-400" />
              <span className="text-sm font-medium hidden sm:block">John Doe</span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold mb-2">Your Repositories</h1>
          <p className="text-muted-foreground">
            Select a repository to analyze or view previous scan results.
          </p>
        </motion.div>

        {/* Search and filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col sm:flex-row gap-4 mb-8"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search repositories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2">
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            <Button variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </motion.div>

        {/* Repository grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRepos.map((repo, index) => (
            <motion.div
              key={repo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              className="glass-panel rounded-xl p-6 hover:shadow-lg transition-all duration-300 group"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      languageColors[repo.language] || "bg-gray-500"
                    }`}
                  />
                  <span className="text-sm text-muted-foreground">
                    {repo.language}
                  </span>
                </div>
                {repo.isPrivate && (
                  <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground">
                    Private
                  </span>
                )}
              </div>

              {/* Title */}
              <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">
                {repo.name}
              </h3>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {repo.description}
              </p>

              {/* Stats */}
              <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Star className="h-4 w-4" />
                  {repo.stars}
                </div>
                <div className="flex items-center gap-1">
                  <GitFork className="h-4 w-4" />
                  {repo.forks}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {repo.updatedAt}
                </div>
              </div>

              {/* Score or Scan status */}
              {repo.score !== null ? (
                <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg">
                  <div>
                    <span className="text-xs text-muted-foreground">Last Score</span>
                    <div className="text-2xl font-bold gradient-text">{repo.score}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground">Scanned</span>
                    <div className="text-sm">{repo.lastScan}</div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-4 p-3 bg-muted/30 rounded-lg">
                  <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                  <span className="text-sm text-muted-foreground">Not analyzed yet</span>
                </div>
              )}

              {/* Action */}
              <Button
                variant={repo.score ? "outline" : "hero"}
                className="w-full gap-2 group"
                onClick={() => handleAnalyze(repo.id)}
              >
                {repo.score ? "View Analysis" : "Analyze Now"}
                <ChevronRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}
