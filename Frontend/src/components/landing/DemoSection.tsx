import { motion } from "framer-motion";
import { Play, Sparkles } from "lucide-react";
import { useState } from "react";

export function DemoSection() {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <section className="py-20 relative overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-primary/5 to-background" />
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">See It In Action</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Watch RepoIQ <span className="gradient-text">Analyze Code</span>
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            See how RepoIQ analyzes your repository in seconds, providing
            actionable insights and comprehensive quality metrics.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="max-w-5xl mx-auto"
        >
          <div className="relative group">
            {/* Video container with gradient border */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary via-cyan-500 to-primary rounded-2xl blur-xl opacity-30 group-hover:opacity-50 transition-opacity" />
            
            <div className="relative glass-panel rounded-2xl overflow-hidden border-2 border-primary/20">
              {/* Video placeholder / actual video */}
              <div className="relative aspect-video bg-gradient-to-br from-background to-muted">
                {!isPlaying ? (
                  <>
                    {/* Thumbnail with play button */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      {/* Animated grid background */}
                      <div className="absolute inset-0 opacity-20">
                        <div className="absolute inset-0" style={{
                          backgroundImage: `linear-gradient(hsl(var(--border)) 1px, transparent 1px),
                                          linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
                          backgroundSize: '50px 50px'
                        }} />
                      </div>

                      {/* Mock dashboard preview */}
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                        className="relative z-10 w-full h-full p-8 flex items-center justify-center"
                      >
                        <div className="w-full max-w-3xl space-y-4">
                          {/* Mock score cards */}
                          <div className="grid grid-cols-3 gap-3">
                            {[
                              { label: "Overall", score: 87, color: "from-cyan-500 to-blue-500" },
                              { label: "Security", score: 92, color: "from-green-500 to-emerald-500" },
                              { label: "Quality", score: 78, color: "from-purple-500 to-pink-500" },
                            ].map((item, i) => (
                              <motion.div
                                key={item.label}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="glass-panel p-4 rounded-lg border border-border/50"
                              >
                                <div className="text-xs text-muted-foreground mb-2">{item.label}</div>
                                <div className={`text-3xl font-bold bg-gradient-to-r ${item.color} bg-clip-text text-transparent`}>
                                  {item.score}
                                </div>
                              </motion.div>
                            ))}
                          </div>

                          {/* Mock analysis progress */}
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="glass-panel p-4 rounded-lg border border-border/50"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-muted-foreground">Analyzing repository...</span>
                              <span className="text-sm font-medium text-primary">85%</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: "85%" }}
                                transition={{ duration: 1.5, delay: 0.5 }}
                                className="h-full bg-gradient-to-r from-primary to-cyan-500"
                              />
                            </div>
                          </motion.div>
                        </div>
                      </motion.div>

                      {/* Play button overlay */}
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsPlaying(true)}
                        className="absolute inset-0 flex items-center justify-center z-20 group/play"
                      >
                        <div className="relative">
                          <div className="absolute inset-0 bg-primary/20 rounded-full blur-2xl scale-150 group-hover/play:scale-175 transition-transform" />
                          <div className="relative w-20 h-20 rounded-full bg-primary flex items-center justify-center shadow-2xl shadow-primary/50 group-hover/play:shadow-primary/70 transition-shadow">
                            <Play className="h-8 w-8 text-primary-foreground ml-1" fill="currentColor" />
                          </div>
                        </div>
                      </motion.button>
                    </div>
                  </>
                ) : (
                  <video
                    className="w-full h-full"
                    controls
                    autoPlay
                    src="/demo-video.mp4" // Replace with your actual video URL
                    poster="/demo-thumbnail.jpg"
                  >
                    Your browser does not support the video tag.
                  </video>
                )}
              </div>

              {/* Decorative corners */}
              <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-primary/50 rounded-tl-lg" />
              <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-primary/50 rounded-tr-lg" />
              <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-primary/50 rounded-bl-lg" />
              <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-primary/50 rounded-br-lg" />
            </div>
          </div>

          {/* Stats below video */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="grid grid-cols-3 gap-6 mt-12 max-w-3xl mx-auto"
          >
            {[
              { value: "< 30s", label: "Average Scan Time" },
              { value: "10K+", label: "Repositories Analyzed" },
              { value: "99.9%", label: "Accuracy Rate" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl font-bold gradient-text mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
