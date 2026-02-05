import { motion } from "framer-motion";
import { Shield, Lock, ShieldCheck, Eye, Server, KeyRound } from "lucide-react";

const securityFeatures = [
  {
    icon: Shield,
    title: "End-to-End Encryption",
    description:
      "Your GitHub tokens and sensitive data are encrypted using AES-256-GCM. All API communications use TLS 1.3 for maximum security.",
    highlights: [
      "AES-256-GCM encryption at rest",
      "TLS 1.3 for all communications",
      "Secure token storage",
    ],
  },
  {
    icon: Eye,
    title: "Data Privacy First",
    description:
      "We analyze your code in real-time and never retain it after processing. Your intellectual property remains yours alone.",
    highlights: [
      "Zero code retention post-analysis",
      "No data sharing with third parties",
      "GDPR compliant practices",
    ],
  },
  {
    icon: ShieldCheck,
    title: "Enterprise Ready",
    description:
      "Built with enterprise security requirements in mind. Role-based access control, comprehensive audit logging, and compliance-ready architecture.",
    highlights: [
      "Role-based access control",
      "Full audit trail logging",
      "SOC 2 ready architecture",
    ],
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" },
  },
};

export function SecuritySection() {
  return (
    <section id="security" className="py-24 relative overflow-hidden">
      {/* Dark gradient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background/95 to-primary/5" />
      
      {/* Subtle grid pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-20" />
      
      {/* Decorative elements */}
      <div className="absolute top-1/4 -left-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 -right-32 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-6">
            <Lock className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary">Security</span>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
            We Take Security{" "}
            <span className="gradient-text">Seriously</span>
          </h2>
          <p className="text-lg text-muted-foreground">
            Your code and data are protected with enterprise-grade security measures.
            We believe security isn't a feature—it's a foundation.
          </p>
        </motion.div>

        {/* Security cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8"
        >
          {securityFeatures.map((feature, index) => (
            <motion.div
              key={index}
              variants={itemVariants}
              className="group relative"
            >
              {/* Card */}
              <div className="glass-panel rounded-2xl p-8 h-full border border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5">
                {/* Icon container with gradient border effect */}
                <div className="relative mb-6">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <feature.icon className="h-8 w-8 text-primary" />
                  </div>
                  {/* Subtle glow on hover */}
                  <div className="absolute inset-0 w-16 h-16 rounded-xl bg-primary/20 blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-300" />
                </div>

                {/* Title */}
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>

                {/* Description */}
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  {feature.description}
                </p>

                {/* Highlights */}
                <ul className="space-y-2">
                  {feature.highlights.map((highlight, idx) => (
                    <li
                      key={idx}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      {highlight}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-16 flex flex-wrap items-center justify-center gap-8 text-muted-foreground"
        >
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            <span className="text-sm">256-bit Encryption</span>
          </div>
          <div className="w-px h-6 bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            <span className="text-sm">Secure Infrastructure</span>
          </div>
          <div className="w-px h-6 bg-border hidden sm:block" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            <span className="text-sm">Privacy Protected</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
