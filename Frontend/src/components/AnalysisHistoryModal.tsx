import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "@/lib/api";
import { Button } from "@/components/ui/button";
import { X, CheckCircle, XCircle, Clock, RefreshCw, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDateOnly, formatRelativeTime } from "@/lib/timeUtils";
import { scoreTextClass } from "@/lib/scoreColor";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";

interface AnalysisRun {
  id: string;
  overall_score: number | null;
  security_score: number | null;
  quality_score: number | null;
  architecture_score: number | null;
  total_issues: number;
  completed_at: string | null;
  status?: string;
}

interface AnalysisHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  repoId: string;
  repoName: string;
}

const RUN_SCORES: { key: "overall_score" | "security_score" | "quality_score" | "architecture_score"; label: string }[] = [
  { key: "overall_score", label: "Overall" },
  { key: "security_score", label: "Security" },
  { key: "quality_score", label: "Quality" },
  { key: "architecture_score", label: "Architecture" },
];

export default function AnalysisHistoryModal({
  isOpen,
  onClose,
  repoId,
  repoName,
}: AnalysisHistoryModalProps) {
  const [history, setHistory] = useState<AnalysisRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const titleId = useId();

  const loadHistory = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      // Pass forceRefresh to API to bypass cache
      const response = await apiClient.getAnalysisHistory(repoId, forceRefresh);
      const runs = response.history || [];

      // Sort by completed_at descending to ensure latest is first
      runs.sort((a: AnalysisRun, b: AnalysisRun) => {
        const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return dateB - dateA;
      });

      setHistory(runs);
    } catch (err) {
      console.error('[AnalysisHistoryModal] Failed to load history:', err);
      setError(err instanceof Error && err.message ? err.message : "Failed to load analysis history");
    } finally {
      setLoading(false);
    }
  }, [repoId]);

  useEffect(() => {
    if (isOpen && repoId) {
      loadHistory();
    }
  }, [isOpen, repoId, loadHistory]);

  // Escape closes, like every other dialog in the app.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const handleViewAnalysis = (analysisId: string) => {
    onClose();
    navigate(`/dashboard/${repoId}?analysis_id=${analysisId}`);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Not completed";
    // Show only date and relative time (e.g., "Jan 27, 2026 (34 minutes ago)")
    const relative = formatRelativeTime(dateString);
    const dateOnly = formatDateOnly(dateString);
    return `${dateOnly} (${relative})`;
  };

  const getStatusIcon = (run: AnalysisRun) => {
    if (run.overall_score !== null && run.overall_score !== undefined) {
      return <CheckCircle className="h-5 w-5 text-score-good" aria-label="Completed" />;
    }
    if (run.status === "failed") {
      return <XCircle className="h-5 w-5 text-sev-critical" aria-label="Failed" />;
    }
    return <Clock className="h-5 w-5 text-muted-foreground" aria-label="Incomplete" />;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          className="relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-4 border-b border-border p-6">
            <div className="min-w-0">
              <h2 id={titleId} className="text-xl font-semibold">Analysis history</h2>
              <p className="mt-1 truncate text-sm text-muted-foreground">{repoName}</p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => loadHistory(true)}
                disabled={loading}
                aria-label="Refresh history"
                title="Refresh history"
              >
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <LoadingState variant="list" count={4} label="Loading analysis history" />
            ) : error ? (
              <EmptyState
                variant="error"
                title="Couldn't load the history"
                body={error}
                onRetry={() => loadHistory(true)}
              />
            ) : history.length === 0 ? (
              <EmptyState icon={Clock} title="No analysis history yet" body="Run an analysis to see it here." />
            ) : (
              <ol className="space-y-2">
                {history.map((run, index) => (
                  <li key={run.id}>
                    <button
                      type="button"
                      onClick={() => handleViewAnalysis(run.id)}
                      className={cn(
                        "group flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        index === 0 ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                      )}
                    >
                      <span className="mt-0.5 shrink-0">{getStatusIcon(run)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{formatDate(run.completed_at)}</span>
                          {index === 0 && (
                            <span className="rounded-md border border-primary/40 px-1.5 py-0.5 text-xs font-medium text-foreground">
                              Latest
                            </span>
                          )}
                        </span>
                        {run.overall_score !== null && run.overall_score !== undefined ? (
                          <span className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            {RUN_SCORES.map(({ key, label }) => (
                              <span key={key}>
                                <span className="text-muted-foreground">{label}</span>{" "}
                                <span className={cn("font-medium tabular-nums", scoreTextClass(run[key]))}>
                                  {run[key] ?? "–"}
                                </span>
                              </span>
                            ))}
                            <span>
                              <span className="text-muted-foreground">Issues</span>{" "}
                              <span className="font-medium tabular-nums">{run.total_issues}</span>
                            </span>
                          </span>
                        ) : (
                          <span className="mt-1.5 block text-sm text-muted-foreground">
                            {run.status === "failed" ? "Analysis failed" : "Analysis incomplete"}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 self-center text-sm text-muted-foreground group-hover:text-foreground">
                        View
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border p-4 text-sm text-muted-foreground sm:px-6">
            <span>
              {history.length > 0
                ? `Showing ${history.length} analysis run${history.length === 1 ? '' : 's'}`
                : 'No analysis runs'}
            </span>
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
