import { motion } from "framer-motion";
import { Link } from "react-router-dom";

export function DocsSection() {
  return (
    <section id="docs" className="py-24 bg-background relative overflow-hidden">
      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto mb-8"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">Documentation & Guides</h2>
          <p className="text-lg text-muted-foreground">
            Find guides, API references, and tutorials to get the most out of RepoIQ.
          </p>
        </motion.div>

        <div className="max-w-4xl mx-auto text-center">
          <p className="text-muted-foreground mb-6">
            Visit the full docs for usage, integration, and developer guides.
          </p>
          <Link to="/docs">
            <button className="btn btn-primary">Open Docs</button>
          </Link>
        </div>
      </div>
    </section>
  );
}
