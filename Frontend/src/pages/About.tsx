import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Target, Users, Zap, Heart, Shield } from "lucide-react";
import { useEffect } from "react";

export default function About() {
  useEffect(() => {
    document.title = "About Us - RepoIQ";
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-24 pb-16">
        {/* Hero */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Building the Future of{" "}
              <span className="gradient-text">Code Intelligence</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              We're on a mission to help development teams ship better code faster with AI-powered insights and automation.
            </p>
          </motion.div>
        </section>

        {/* Mission & Vision */}
        <section className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="glass-panel p-8 rounded-2xl"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
              <p className="text-muted-foreground">
                To empower every development team with enterprise-grade code intelligence, making high-quality, secure software accessible to all. We believe great code shouldn't require expensive consultants or massive teams.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="glass-panel p-8 rounded-2xl"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-4">Our Vision</h2>
              <p className="text-muted-foreground">
                A world where every line of code is analyzed, understood, and improved by AI. Where security vulnerabilities are caught before they ship, and code quality is maintained effortlessly across growing teams.
              </p>
            </motion.div>
          </div>
        </section>

        {/* Story */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="max-w-3xl mx-auto glass-panel p-12 rounded-2xl"
          >
            <h2 className="text-3xl font-bold mb-6 text-center">Our Story</h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                RepoIQ was born out of frustration. As developers ourselves, we experienced the pain of managing code quality across growing teams, dealing with security vulnerabilities discovered too late, and spending countless hours in code reviews that could be automated.
              </p>
              <p>
                We noticed that while AI was revolutionizing many industries, software development was still stuck with static analysis tools from the 2000s. Code reviews were manual, security scans were slow, and documentation was always out of date.
              </p>
              <p>
                So we built RepoIQ — an AI-powered platform that understands your code like a senior engineer would. It analyzes architecture, detects security issues, generates documentation, and provides actionable insights in seconds, not hours.
              </p>
              <p>
                Today, we're proud to help thousands of teams maintain high code quality while shipping faster than ever. And we're just getting started.
              </p>
            </div>
          </motion.div>
        </section>

        {/* Values */}
        <section className="container mx-auto px-4 py-12">
          <h2 className="text-3xl font-bold text-center mb-12">Our Values</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              {
                icon: Users,
                title: "Developer First",
                description: "We build tools for developers, by developers. Every feature is designed to solve real problems we've experienced ourselves."
              },
              {
                icon: Shield,
                title: "Security by Default",
                description: "Your code is your IP. We use bank-level encryption and never store your code permanently. Privacy is non-negotiable."
              },
              {
                icon: Heart,
                title: "Quality Over Speed",
                description: "We ship fast, but we never compromise on quality. Our code goes through the same rigorous analysis we provide to you."
              }
            ].map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
                className="glass-panel p-6 rounded-xl text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <value.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-3">{value.title}</h3>
                <p className="text-sm text-muted-foreground">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="text-center"
          >
            <h2 className="text-3xl font-bold mb-4">Join Us on This Journey</h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              We're always looking for talented people who share our passion for building great developer tools.
            </p>
            <div className="flex gap-4 justify-center">
              <a
                href="/careers"
                className="px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
              >
                View Open Positions
              </a>
              <a
                href="/contact"
                className="px-8 py-3 border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Get in Touch
              </a>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
