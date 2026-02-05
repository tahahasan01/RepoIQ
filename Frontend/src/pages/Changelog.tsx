import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Calendar, Zap, Shield, Code2, Users, Bell } from "lucide-react";
import { useEffect } from "react";

const releases = [
  {
    version: "2.1.0",
    date: "January 27, 2026",
    type: "major",
    changes: [
      { icon: Zap, type: "feature", text: "Lightning-fast repository analysis (under 60 seconds)" },
      { icon: Users, type: "feature", text: "Team collaboration workspaces and shared reports" },
      { icon: Shield, type: "improvement", text: "Enhanced security scanning with zero-day vulnerability detection" },
      { icon: Code2, type: "fix", text: "Fixed code complexity calculation for nested functions" }
    ]
  },
  {
    version: "2.0.0",
    date: "January 15, 2026",
    type: "major",
    changes: [
      { icon: Bell, type: "feature", text: "Smart notifications for critical issues and quality regressions" },
      { icon: Shield, type: "feature", text: "End-to-end encryption for all repository data" },
      { icon: Code2, type: "improvement", text: "Improved code documentation generation" },
      { icon: Zap, type: "improvement", text: "50% faster analysis performance" }
    ]
  },
  {
    version: "1.5.0",
    date: "December 20, 2025",
    type: "minor",
    changes: [
      { icon: Users, type: "feature", text: "Organization and team management" },
      { icon: Code2, type: "feature", text: "Custom code quality rules" },
      { icon: Shield, type: "improvement", text: "Enhanced dependency vulnerability scanning" },
      { icon: Zap, type: "fix", text: "Fixed memory leak in large repository analysis" }
    ]
  },
  {
    version: "1.4.0",
    date: "December 1, 2025",
    type: "minor",
    changes: [
      { icon: Code2, type: "feature", text: "Architecture diagram visualization" },
      { icon: Bell, type: "feature", text: "Slack and email integration" },
      { icon: Shield, type: "improvement", text: "Improved security pattern detection" },
      { icon: Zap, type: "fix", text: "Fixed analysis timeout for large repositories" }
    ]
  },
  {
    version: "1.3.0",
    date: "November 15, 2025",
    type: "minor",
    changes: [
      { icon: Code2, type: "feature", text: "Real-time code quality dashboards" },
      { icon: Shield, type: "feature", text: "Secret exposure detection" },
      { icon: Users, type: "improvement", text: "Enhanced team performance metrics" },
      { icon: Zap, type: "fix", text: "Fixed GitHub API rate limiting issues" }
    ]
  }
];

const typeColors = {
  feature: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  improvement: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  fix: "bg-amber-500/10 text-amber-500 border-amber-500/20"
};

export default function Changelog() {
  useEffect(() => {
    document.title = "Changelog - RepoIQ";
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
              Product <span className="gradient-text">Changelog</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Stay up to date with new features, improvements, and bug fixes.
            </p>
          </motion.div>

          {/* Timeline */}
          <div className="max-w-4xl mx-auto">
            {releases.map((release, index) => (
              <motion.div
                key={release.version}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative pl-8 pb-12 border-l-2 border-border last:border-l-0 last:pb-0"
              >
                {/* Timeline dot */}
                <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-primary border-4 border-background" />
                
                <div className="glass-panel p-6 rounded-xl">
                  {/* Release header */}
                  <div className="flex items-center gap-4 mb-4">
                    <h2 className="text-2xl font-bold">v{release.version}</h2>
                    {release.type === "major" && (
                      <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-semibold rounded-full border border-primary/20">
                        Major Release
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2 text-muted-foreground mb-6">
                    <Calendar className="h-4 w-4" />
                    <span className="text-sm">{release.date}</span>
                  </div>

                  {/* Changes */}
                  <ul className="space-y-3">
                    {release.changes.map((change, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-muted">
                          <change.icon className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded border ${typeColors[change.type as keyof typeof typeColors]}`}>
                              {change.type}
                            </span>
                          </div>
                          <p className="text-sm text-foreground">{change.text}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
