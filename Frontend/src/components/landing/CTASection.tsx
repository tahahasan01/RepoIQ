import { motion } from "framer-motion";
import { Github, ArrowRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

export function CTASection() {
  return (
    <section className="py-24 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 hero-gradient" />
      <div className="absolute inset-0 bg-grid-pattern opacity-20" />
      
      {/* Glow effects */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 4, repeat: Infinity }}
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/20 rounded-full blur-3xl"
      />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl mx-auto text-center"
        >
          {/* Icon */}
          <motion.div
            initial={{ scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, type: "spring" }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-cyan-400 mb-8 shadow-lg"
          >
            <Zap className="h-8 w-8 text-primary-foreground" />
          </motion.div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6 text-foreground">
            Ready to Improve Your{" "}
            <span className="gradient-text">Code Quality</span>?
          </h2>
          
          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto">
            Join thousands of developers who use RepoIQ to analyze, improve, and maintain high-quality codebases.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/signup">
              <Button variant="hero" size="xl" className="gap-3 group">
                <Github className="h-5 w-5" />
                Start Free Analysis
                <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            <Button variant="heroOutline" size="lg">
              View Documentation
            </Button>
          </div>

          {/* Trust badges */}
          <div className="mt-12 flex items-center justify-center gap-8 text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-sm">Free to start</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-sm">No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-sm">SOC 2 compliant</span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
