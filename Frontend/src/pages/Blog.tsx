import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { motion } from "framer-motion";
import { Calendar, Clock, ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";

const blogPosts = [
  {
    id: 1,
    title: "10 Security Vulnerabilities Every Developer Should Know",
    excerpt: "Learn about the most common security issues in modern web applications and how to prevent them in your codebase.",
    author: "Sarah Chen",
    date: "January 25, 2026",
    readTime: "8 min read",
    category: "Security",
    image: "https://images.unsplash.com/photo-1555949963-aa79dcee981c?w=800&h=400&fit=crop"
  },
  {
    id: 2,
    title: "The Complete Guide to Code Quality Metrics",
    excerpt: "Understand which metrics matter and how to use them to improve your team's code quality over time.",
    author: "Mike Johnson",
    date: "January 20, 2026",
    readTime: "12 min read",
    category: "Best Practices",
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=400&fit=crop"
  },
  {
    id: 3,
    title: "How AI is Transforming Code Reviews",
    excerpt: "Explore how artificial intelligence is making code reviews faster, more consistent, and more effective.",
    author: "Alex Kumar",
    date: "January 15, 2026",
    readTime: "6 min read",
    category: "AI & ML",
    image: "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=800&h=400&fit=crop"
  },
  {
    id: 4,
    title: "Building Scalable Architecture: Lessons from the Trenches",
    excerpt: "Real-world lessons and patterns for building software that scales from thousands to millions of users.",
    author: "Sarah Chen",
    date: "January 10, 2026",
    readTime: "15 min read",
    category: "Architecture",
    image: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=400&fit=crop"
  },
  {
    id: 5,
    title: "The State of Code Quality in 2026",
    excerpt: "Our annual report on code quality trends, benchmarks, and predictions for the year ahead.",
    author: "Mike Johnson",
    date: "January 5, 2026",
    readTime: "10 min read",
    category: "Industry Insights",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&h=400&fit=crop"
  },
  {
    id: 6,
    title: "Automating Technical Debt Management",
    excerpt: "Practical strategies and tools for tracking, prioritizing, and paying down technical debt systematically.",
    author: "Alex Kumar",
    date: "December 28, 2025",
    readTime: "9 min read",
    category: "Best Practices",
    image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&h=400&fit=crop"
  }
];

const categories = ["All", "Security", "Best Practices", "AI & ML", "Architecture", "Industry Insights"];

export default function Blog() {
  useEffect(() => {
    document.title = "Blog - RepoIQ";
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
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              RepoIQ <span className="gradient-text">Blog</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Insights, tutorials, and best practices for modern software development.
            </p>
          </motion.div>

          {/* Categories */}
          <div className="flex flex-wrap gap-3 justify-center mb-12">
            {categories.map((category) => (
              <button
                key={category}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  category === "All"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80"
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </section>

        {/* Blog Grid */}
        <section className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {blogPosts.map((post, index) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="glass-panel rounded-xl overflow-hidden hover:shadow-xl transition-all group cursor-pointer"
              >
                {/* Image */}
                <div className="relative h-48 overflow-hidden">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-4 left-4">
                    <span className="px-3 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full">
                      {post.category}
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="text-xl font-semibold mb-3 group-hover:text-primary transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-muted-foreground text-sm mb-4 line-clamp-2">
                    {post.excerpt}
                  </p>

                  {/* Meta */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{post.date}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{post.readTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* Author */}
                  <div className="flex items-center justify-between pt-4 border-t border-border">
                    <span className="text-sm font-medium">{post.author}</span>
                    <ArrowRight className="h-4 w-4 text-primary group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              </motion.article>
            ))}
          </div>

          {/* Load More */}
          <div className="text-center mt-12">
            <button className="px-8 py-3 border border-border rounded-lg hover:bg-muted transition-colors">
              Load More Articles
            </button>
          </div>
        </section>

        {/* Newsletter */}
        <section className="container mx-auto px-4 py-16 mt-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="glass-panel p-12 rounded-2xl max-w-3xl mx-auto text-center"
          >
            <h2 className="text-3xl font-bold mb-4">Subscribe to Our Newsletter</h2>
            <p className="text-muted-foreground mb-8">
              Get the latest articles, tutorials, and product updates delivered to your inbox.
            </p>
            <div className="flex gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-3 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button className="px-6 py-3 bg-gradient-to-r from-primary to-cyan-400 text-primary-foreground font-semibold rounded-lg hover:opacity-90 transition-opacity">
                Subscribe
              </button>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
