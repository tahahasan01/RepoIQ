import { motion } from "framer-motion";
import { X } from "lucide-react";
import React from "react";

export default function DemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.18 }}
        className="relative max-w-4xl w-full mx-4"
      >
        <div className="bg-card rounded-2xl overflow-hidden shadow-2xl">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <div className="text-sm font-semibold">RepoIQ Demo</div>
            <button onClick={onClose} className="p-2 rounded-md hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="bg-black/80">
            <video
              src="/demo-video.mp4"
              poster="/demo-thumbnail.jpg"
              controls
              autoPlay
              className="w-full h-80 object-cover bg-black"
            >
              Your browser does not support HTML5 video.
            </video>
          </div>

          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              This demo shows how RepoIQ analyzes a repository, generates a score,
              and surfaces actionable recommendations.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
