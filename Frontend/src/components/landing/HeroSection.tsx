import { motion } from "framer-motion";
import { Github, Sparkles, ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useState } from "react";
import DemoModal from "@/components/landing/DemoModal";

export function HeroSection() {
  const [open, setOpen] = useState(false);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden hero-gradient">
      {/* Background effects */}
      <div className="absolute inset-0">
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-grid-pattern opacity-30" />
        
        {/* Gradient orbs */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1 }}
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
        />
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-400/15 rounded-full blur-3xl"
        />
        
        {/* Floating elements */}
        <motion.div
          animate={{ y: [-10, 10, -10] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-1/3 right-1/4 w-4 h-4 bg-primary rounded-full opacity-50"
        />
        <motion.div
          animate={{ y: [10, -10, 10] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-1/3 left-1/4 w-3 h-3 bg-cyan-400 rounded-full opacity-40"
        />
      </div>

      <div className="container mx-auto px-4 relative z-10 pt-24">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass-panel mb-8"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              AI-Powered Code Intelligence
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight text-foreground"
          >
            Transform Your Code with{" "}
            <span className="gradient-text">AI Intelligence</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
          >
            Analyze, score, and improve your GitHub repositories in minutes. 
            Get security insights, architecture suggestions, and AI-generated fixes.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link to="/login">
              <Button variant="hero" size="xl" className="gap-3 group">
                <Github className="h-5 w-5" />
                Login with GitHub
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button
              variant="heroOutline"
              size="xl"
              className="gap-3"
              onClick={() => setOpen(true)}
            >
              <Play className="h-5 w-5" />
              Watch Demo
            </Button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="grid grid-cols-3 gap-8 mt-16 max-w-lg mx-auto"
          >
            {[
              { value: "10K+", label: "Repos Analyzed" },
              { value: "1M+", label: "Issues Found" },
              { value: "99%", label: "Accuracy" },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold gradient-text">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </motion.div>

          {/* Preview */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.5 }}
            className="mt-16 relative"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 pointer-events-none" />
            <div className="glass-panel rounded-2xl p-1 shadow-2xl">
              <div className="rounded-xl bg-card overflow-hidden">
                {/* Mock dashboard preview */}
                <div className="bg-muted/50 h-8 flex items-center gap-2 px-4 border-b border-border">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-warning/60" />
                  <div className="w-3 h-3 rounded-full bg-success/60" />
                  <span className="text-xs text-muted-foreground ml-4 font-mono">
                    repoiq.app/dashboard
                  </span>
                </div>
                <div className="h-80 bg-gradient-to-br from-card to-muted/30 p-6">
                  <div className="grid grid-cols-4 gap-4 h-full">
                    {/* Sidebar mock */}
                    <div className="col-span-1 bg-muted/30 rounded-lg p-3">
                      <div className="space-y-3">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-primary/30 rounded w-full" />
                        <div className="h-3 bg-muted rounded w-2/3" />
                        <div className="h-3 bg-muted rounded w-full" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                    {/* Main content mock */}
                    <div className="col-span-3 space-y-4">
                      <div className="grid grid-cols-4 gap-3">
                        {[87, 92, 78, 95].map((score, i) => (
                          <div key={i} className="bg-muted/30 rounded-lg p-4 text-center">
                            <div className="text-2xl font-bold gradient-text">
                              {score}
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Score
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="bg-muted/30 rounded-lg p-4 flex-1">
                        <div className="space-y-2">
                          <div className="h-3 bg-muted rounded w-1/4" />
                          <div className="h-20 bg-muted/50 rounded" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
          <DemoModal open={open} onClose={() => setOpen(false)} />
        </div>
      </div>
    </section>
  );
}
