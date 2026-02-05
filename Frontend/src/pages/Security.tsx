import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Shield, Lock, Eye, Server, KeyRound, FileCheck, AlertTriangle, CheckCircle } from "lucide-react";
import { useEffect } from "react";

const securityFeatures = [
  {
    icon: Lock,
    title: "End-to-End Encryption",
    description: "All data is encrypted in transit using TLS 1.3 and at rest using AES-256-GCM encryption.",
    details: [
      "GitHub tokens encrypted with PBKDF2HMAC key derivation",
      "All API communications over HTTPS only",
      "Database-level encryption for sensitive data",
      "Encrypted backups with separate key management"
    ]
  },
  {
    icon: Eye,
    title: "Zero Code Retention",
    description: "We process your code in memory and never permanently store your source code on our servers.",
    details: [
      "Code processed in ephemeral containers",
      "Automatic memory cleanup after analysis",
      "Only analysis results are stored",
      "Full data deletion on account closure"
    ]
  },
  {
    icon: Server,
    title: "Infrastructure Security",
    description: "Enterprise-grade infrastructure with multiple layers of security controls.",
    details: [
      "SOC 2 Type II certified data centers",
      "Regular penetration testing",
      "24/7 security monitoring and alerts",
      "Automated vulnerability scanning"
    ]
  },
  {
    icon: KeyRound,
    title: "Access Control",
    description: "Strict authentication and authorization mechanisms to protect your data.",
    details: [
      "OAuth 2.0 with GitHub for authentication",
      "Role-based access control (RBAC)",
      "Multi-factor authentication (MFA) support",
      "Session management with automatic expiry"
    ]
  },
  {
    icon: FileCheck,
    title: "Compliance",
    description: "We meet industry standards and regulations for data protection and privacy.",
    details: [
      "GDPR compliant data handling",
      "SOC 2 Type II certification",
      "Regular third-party security audits",
      "ISO 27001 alignment"
    ]
  },
  {
    icon: AlertTriangle,
    title: "Incident Response",
    description: "Comprehensive incident response plan to handle security events quickly and effectively.",
    details: [
      "24/7 security operations center (SOC)",
      "Automated threat detection and response",
      "Transparent breach notification policy",
      "Regular security drills and training"
    ]
  }
];

const certifications = [
  { name: "SOC 2 Type II", status: "Certified" },
  { name: "ISO 27001", status: "In Progress" },
  { name: "GDPR", status: "Compliant" },
  { name: "CCPA", status: "Compliant" }
];

export default function Security() {
  useEffect(() => {
    document.title = "Security - RepoIQ";
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
            className="text-center mb-12"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Security <span className="gradient-text">First</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Your code is your intellectual property. We implement enterprise-grade security measures to keep it safe.
            </p>
          </motion.div>
        </section>

        {/* Security Features */}
        <section className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {securityFeatures.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className="glass-panel p-6 rounded-xl"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                <p className="text-muted-foreground text-sm mb-4">{feature.description}</p>
                <ul className="space-y-2">
                  {feature.details.map((detail, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>{detail}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Certifications */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="max-w-4xl mx-auto glass-panel p-12 rounded-2xl"
          >
            <h2 className="text-3xl font-bold mb-8 text-center">Certifications & Compliance</h2>
            <div className="grid md:grid-cols-2 gap-6">
              {certifications.map((cert, index) => (
                <div
                  key={cert.name}
                  className="flex items-center justify-between p-4 bg-muted rounded-lg"
                >
                  <span className="font-semibold">{cert.name}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    cert.status === "Certified" || cert.status === "Compliant"
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-blue-500/10 text-blue-500"
                  }`}>
                    {cert.status}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Security Practices */}
        <section className="container mx-auto px-4 py-16">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold mb-12 text-center">Our Security Practices</h2>
            <div className="space-y-6">
              {[
                {
                  title: "Regular Security Audits",
                  description: "We conduct quarterly internal security audits and annual third-party penetration tests to identify and address vulnerabilities."
                },
                {
                  title: "Employee Training",
                  description: "All employees undergo security awareness training and follow strict security protocols when handling customer data."
                },
                {
                  title: "Secure Development",
                  description: "We follow secure coding practices, conduct code reviews, and use automated security scanning in our CI/CD pipeline."
                },
                {
                  title: "Data Minimization",
                  description: "We only collect and retain data necessary to provide our services. Source code is never permanently stored."
                },
                {
                  title: "Vendor Management",
                  description: "All third-party vendors undergo security assessments to ensure they meet our security standards."
                },
                {
                  title: "Incident Response Plan",
                  description: "We maintain a comprehensive incident response plan with clear procedures for detecting, responding to, and recovering from security incidents."
                }
              ].map((practice, index) => (
                <motion.div
                  key={practice.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: 1 + index * 0.1 }}
                  className="glass-panel p-6 rounded-xl"
                >
                  <h3 className="text-lg font-semibold mb-2">{practice.title}</h3>
                  <p className="text-muted-foreground text-sm">{practice.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Responsible Disclosure */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.6 }}
            className="max-w-3xl mx-auto glass-panel p-12 rounded-2xl text-center"
          >
            <h2 className="text-3xl font-bold mb-4">Responsible Disclosure</h2>
            <p className="text-muted-foreground mb-6">
              If you discover a security vulnerability, please report it to us responsibly. We appreciate your efforts to keep RepoIQ secure.
            </p>
            <a
              href="mailto:security@repoiq.dev"
              className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Report a Vulnerability
            </a>
            <p className="text-sm text-muted-foreground mt-4">
              Email: security@repoiq.dev
            </p>
          </motion.div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.8 }}
            className="text-center"
          >
            <h2 className="text-2xl font-bold mb-4">Questions About Our Security?</h2>
            <p className="text-muted-foreground mb-8">
              Contact our security team for more information about our security practices.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center gap-2 px-6 py-3 border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Contact Security Team
            </a>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
