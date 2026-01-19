import { motion } from "framer-motion";
import { Check, Zap, Building2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for trying out RepoIQ",
    icon: Zap,
    features: [
      "3 repositories",
      "Basic code analysis",
      "Security scanning",
      "Community support",
      "7-day scan history",
    ],
    cta: "Get Started",
    variant: "outline" as const,
    popular: false,
  },
  {
    name: "Pro",
    price: "$19",
    period: "per month",
    description: "For individual developers and small teams",
    icon: Rocket,
    features: [
      "Unlimited repositories",
      "Advanced AI analysis",
      "Priority security alerts",
      "AI-generated fixes",
      "Auto documentation",
      "Email support",
      "90-day scan history",
      "API access",
    ],
    cta: "Start Free Trial",
    variant: "hero" as const,
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "per year",
    description: "For large organizations with advanced needs",
    icon: Building2,
    features: [
      "Everything in Pro",
      "SSO & SAML",
      "Custom integrations",
      "Dedicated support",
      "SLA guarantee",
      "On-premise option",
      "Unlimited history",
      "Custom AI training",
    ],
    cta: "Contact Sales",
    variant: "outline" as const,
    popular: false,
  },
];

export function PricingSection() {
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
            Simple, Transparent <span className="gradient-text">Pricing</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Start free and scale as you grow. No hidden fees, cancel anytime.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`relative glass-panel rounded-2xl p-8 ${
                plan.popular ? "ring-2 ring-primary" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="px-4 py-1 rounded-full bg-primary text-primary-foreground text-sm font-medium">
                    Most Popular
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <plan.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-bold">{plan.name}</h3>
              </div>

              <div className="mb-2">
                <span className="text-4xl font-bold">{plan.price}</span>
                <span className="text-muted-foreground ml-2">/{plan.period}</span>
              </div>
              <p className="text-sm text-muted-foreground mb-6">{plan.description}</p>

              <Link to="/signup">
                <Button variant={plan.variant} className="w-full mb-6">
                  {plan.cta}
                </Button>
              </Link>

              <ul className="space-y-3">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <Check className="h-4 w-4 text-success flex-shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
