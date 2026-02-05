import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { MapPin, Briefcase, Clock, ArrowRight } from "lucide-react";
import { useEffect } from "react";

const openings = [
  {
    title: "Senior Backend Engineer",
    department: "Engineering",
    location: "Remote / San Francisco",
    type: "Full-time",
    description: "Build scalable backend systems that power code analysis for thousands of repositories."
  },
  {
    title: "Frontend Engineer",
    department: "Engineering",
    location: "Remote / New York",
    type: "Full-time",
    description: "Create beautiful, performant user interfaces that make complex data accessible and actionable."
  },
  {
    title: "Machine Learning Engineer",
    department: "AI/ML",
    location: "Remote / London",
    type: "Full-time",
    description: "Develop and train models that understand code patterns, security vulnerabilities, and quality metrics."
  },
  {
    title: "DevOps Engineer",
    department: "Infrastructure",
    location: "Remote",
    type: "Full-time",
    description: "Build and maintain the infrastructure that enables lightning-fast code analysis at scale."
  },
  {
    title: "Product Designer",
    department: "Design",
    location: "Remote / San Francisco",
    type: "Full-time",
    description: "Design intuitive experiences that help developers understand and improve their code quality."
  },
  {
    title: "Technical Writer",
    department: "Content",
    location: "Remote",
    type: "Full-time / Contract",
    description: "Create comprehensive documentation, tutorials, and guides for our developer audience."
  }
];

const benefits = [
  "Competitive salary and equity",
  "Health, dental, and vision insurance",
  "Unlimited PTO and flexible hours",
  "Remote-first culture",
  "Home office stipend ($2,000)",
  "Learning and development budget",
  "Latest tech equipment",
  "Annual team retreats",
  "Paid parental leave",
  "401(k) with company match"
];

export default function Careers() {
  useEffect(() => {
    document.title = "Careers - RepoIQ";
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
              Join Our <span className="gradient-text">Team</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Help us build the future of code intelligence. We're a remote-first team of passionate developers, designers, and product builders.
            </p>
          </motion.div>
        </section>

        {/* Values */}
        <section className="container mx-auto px-4 py-12">
          <h2 className="text-3xl font-bold text-center mb-12">Why RepoIQ?</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-16">
            {[
              {
                title: "Impact",
                description: "Your work directly impacts thousands of developers and millions of lines of code."
              },
              {
                title: "Growth",
                description: "Learn from talented teammates and work on challenging problems at the intersection of AI and software engineering."
              },
              {
                title: "Balance",
                description: "We believe in sustainable pace. Work-life balance isn't a perk—it's a requirement."
              }
            ].map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className="glass-panel p-6 rounded-xl"
              >
                <h3 className="text-xl font-semibold mb-3">{value.title}</h3>
                <p className="text-muted-foreground text-sm">{value.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Open Positions */}
        <section className="container mx-auto px-4 py-12">
          <h2 className="text-3xl font-bold text-center mb-12">Open Positions</h2>
          <div className="max-w-4xl mx-auto space-y-4">
            {openings.map((job, index) => (
              <motion.div
                key={job.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.05 }}
                className="glass-panel p-6 rounded-xl hover:shadow-lg transition-all group cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-semibold group-hover:text-primary transition-colors">
                        {job.title}
                      </h3>
                      <span className="px-2 py-1 bg-primary/10 text-primary text-xs font-semibold rounded">
                        {job.department}
                      </span>
                    </div>
                    <p className="text-muted-foreground text-sm mb-4">{job.description}</p>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        <span>{job.location}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Briefcase className="h-4 w-4" />
                        <span>{job.type}</span>
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-5 w-5 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Benefits */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="max-w-4xl mx-auto glass-panel p-12 rounded-2xl"
          >
            <h2 className="text-3xl font-bold mb-8 text-center">Benefits & Perks</h2>
            <div className="grid md:grid-cols-2 gap-4">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">{benefit}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.8 }}
            className="text-center"
          >
            <h2 className="text-3xl font-bold mb-4">Don't See a Perfect Fit?</h2>
            <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
              We're always looking for talented people. Send us your resume and tell us why you'd be a great addition to the team.
            </p>
            <a
              href="/contact"
              className="inline-flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-primary to-cyan-400 text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              Get in Touch
            </a>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
