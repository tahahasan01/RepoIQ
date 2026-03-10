import { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  Star,
  GitFork,
  Users,
  Zap,
  RefreshCw,
  FlaskConical,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/ThemeToggle";
import AccountDropdown from "@/components/layout/AccountDropdown";
import NotificationBell from "@/components/NotificationBell";
import apiClient from "@/lib/api";

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "stars", label: "Total Stars" },
  { value: "followers", label: "Followers" },
  { value: "repos", label: "DS Repo Count" },
];

const LIMIT_OPTIONS = [10, 20, 30];

const languageColors: Record<string, string> = {
  Python: "bg-green-500",
  Jupyter: "bg-orange-400",
  R: "bg-blue-500",
  Julia: "bg-purple-500",
  TypeScript: "bg-blue-500",
  JavaScript: "bg-yellow-500",
  Scala: "bg-red-500",
  Go: "bg-cyan-500",
  Java: "bg-red-500",
  "C++": "bg-indigo-500",
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

interface Repo {
  name: string;
  full_name: string;
  description: string | null;
  url: string;
  stars: number;
  forks: number;
  language: string | null;
  topics: string[];
}

interface Profile {
  username: string;
  name: string;
  avatar_url: string;
  profile_url: string;
  type: string;
  bio: string | null;
  followers: number;
  total_stars: number;
  total_forks: number;
  repo_count: number;
  languages: string[];
  top_repos: Repo[];
}

export default function DataScienceProfiles() {
  const [sortBy, setSortBy] = useState("stars");
  const [limit, setLimit] = useState(10);

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["dataScienceProfiles", sortBy, limit],
    queryFn: () => apiClient.getDataScienceProfiles(limit, sortBy),
    staleTime: 30 * 60 * 1000, // 30 minutes (matches backend cache)
  });

  const profiles: Profile[] = data?.profiles ?? [];

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
            <NotificationBell />
            <ThemeToggle />
            <AccountDropdown />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Page heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <FlaskConical className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-bold">Top Data Science Profiles</h1>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Discover the best GitHub profiles with data-science related
            repositories — ranked by stars, followers, or number of DS repos.
          </p>
        </motion.div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                Sort:{" "}
                {SORT_OPTIONS.find((o) => o.value === sortBy)?.label}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup value={sortBy} onValueChange={setSortBy}>
                {SORT_OPTIONS.map((opt) => (
                  <DropdownMenuRadioItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Limit */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                Show: {limit} profiles
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuRadioGroup
                value={String(limit)}
                onValueChange={(v) => setLimit(Number(v))}
              >
                {LIMIT_OPTIONS.map((n) => (
                  <DropdownMenuRadioItem key={n} value={String(n)}>
                    {n} profiles
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>

          {data && (
            <span className="ml-auto text-sm text-muted-foreground">
              {data.total} profiles found
            </span>
          )}
        </div>

        {/* Loading skeleton */}
        {isLoading && (
          <div className="grid gap-6 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader className="flex flex-row items-center gap-4 pb-2">
                  <div className="w-14 h-14 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="h-3 bg-muted rounded" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Error state */}
        {isError && (
          <div className="text-center py-16">
            <p className="text-destructive mb-4">
              Failed to load profiles. Make sure your GitHub account is connected.
            </p>
            <Button onClick={() => refetch()}>Retry</Button>
          </div>
        )}

        {/* Profiles grid */}
        {!isLoading && !isError && (
          <div className="grid gap-6 md:grid-cols-2">
            {profiles.map((profile, index) => (
              <motion.div
                key={profile.username}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className="h-full hover:shadow-md transition-shadow">
                  <CardHeader className="flex flex-row items-start gap-4 pb-3">
                    {/* Rank badge */}
                    <div className="flex-shrink-0 relative">
                      <Avatar className="w-14 h-14">
                        <AvatarImage
                          src={profile.avatar_url}
                          alt={profile.username}
                        />
                        <AvatarFallback>
                          {profile.username.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-base truncate">
                          {profile.name || profile.username}
                        </h3>
                        {profile.type === "Organization" && (
                          <Badge variant="secondary" className="text-[10px]">
                            Org
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        @{profile.username}
                      </p>
                      {profile.bio && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {profile.bio}
                        </p>
                      )}
                    </div>

                    <a
                      href={profile.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0"
                    >
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </a>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Stats row */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 text-yellow-500" />
                        {formatNumber(profile.total_stars)} stars
                      </span>
                      <span className="flex items-center gap-1">
                        <GitFork className="h-3.5 w-3.5" />
                        {formatNumber(profile.total_forks)} forks
                      </span>
                      {profile.followers > 0 && (
                        <span className="flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" />
                          {formatNumber(profile.followers)} followers
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <FlaskConical className="h-3.5 w-3.5 text-primary" />
                        {profile.repo_count} DS repos
                      </span>
                    </div>

                    {/* Languages */}
                    {profile.languages.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {profile.languages.slice(0, 5).map((lang) => (
                          <span
                            key={lang}
                            className="flex items-center gap-1 text-xs"
                          >
                            <span
                              className={`inline-block w-2 h-2 rounded-full ${
                                languageColors[lang] ?? "bg-gray-400"
                              }`}
                            />
                            {lang}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Top repos */}
                    {profile.top_repos.length > 0 && (
                      <div className="space-y-2 border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Top Repos
                        </p>
                        {profile.top_repos.map((repo) => (
                          <a
                            key={repo.full_name}
                            href={repo.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block group"
                          >
                            <div className="flex items-start justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-muted transition-colors">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                                  {repo.name}
                                </p>
                                {repo.description && (
                                  <p className="text-xs text-muted-foreground truncate">
                                    {repo.description}
                                  </p>
                                )}
                                {repo.topics.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {repo.topics.map((t) => (
                                      <Badge
                                        key={t}
                                        variant="outline"
                                        className="text-[9px] px-1 py-0"
                                      >
                                        {t}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                                <Star className="h-3 w-3 text-yellow-500" />
                                {formatNumber(repo.stars)}
                              </div>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !isError && profiles.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <FlaskConical className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>No profiles found. Try refreshing or connecting your GitHub account.</p>
          </div>
        )}
      </main>
    </div>
  );
}
