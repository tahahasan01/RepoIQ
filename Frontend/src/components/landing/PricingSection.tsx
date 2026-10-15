import { motion } from "framer-motion";
import { Check, Info, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { FREE_PLAN } from "@/content/plan";

export function PricingSection() {
  const { isAuthenticated } = useAuth();

  return (
    <section id="pricing" className="py-24 bg-background relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            One plan, <span className="gradient-text">and it's free</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            There are no paid plans and no trials. Every account gets every feature, within the
            limits below.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative glass-panel rounded-2xl p-8 max-w-xl mx-auto ring-2 ring-primary"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold">{FREE_PLAN.name}</h3>
          </div>

          <div className="mb-2">
            <span className="text-4xl font-bold">{FREE_PLAN.price}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-6">{FREE_PLAN.description}</p>

          <Link to={isAuthenticated ? "/repos" : "/signup"}>
            <Button variant="hero" className="w-full mb-6">
              {isAuthenticated ? "Open your repositories" : "Sign up with GitHub"}
            </Button>
          </Link>

          <ul className="space-y-3">
            {FREE_PLAN.features.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm">
                <Check className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                {feature}
              </li>
            ))}
          </ul>

          <ul className="mt-6 pt-6 border-t border-border space-y-3">
            {FREE_PLAN.limits.map((limit) => (
              <li key={limit} className="flex items-start gap-3 text-sm text-muted-foreground">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                {limit}
              </li>
            ))}
          </ul>
        </motion.div>
      </div>
    </section>
  );
}
