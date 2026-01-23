import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "@/lib/api";
import { Button } from "@/components/ui/button";
import { X, CheckCircle, XCircle, Clock, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

  useEffect(() => {
    if (isOpen && repoId) {
      loadHistory();
    }
  }, [isOpen, repoId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('[AnalysisHistoryModal] Loading history for repo:', repoId);
      
      const response = await apiClient.getAnalysisHistory(repoId);
      console.log('[AnalysisHistoryModal] History response:', response);
      
      const runs = response.history || [];
      setHistory(runs);
      
      if (runs.length === 0) {
        setError("No analysis history found for this repository.");
      }
    } catch (err: any) {
      console.error('[AnalysisHistoryModal] Failed to load history:', err);
      setError(err?.message || "Failed to load analysis history");
    } finally {
      setLoading(false);
    }
  };

  const handleViewAnalysis = (analysisId: string) => {
    console.log('[AnalysisHistoryModal] Viewing analysis:', analysisId);
    onClose();
    navigate(`/dashboard/${repoId}?analysis_id=${analysisId}`);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).format(date);
    } catch {
      return dateString;
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null || score === undefined) return "text-gray-400";
    if (score >= 80) return "text-green-500";
    if (score >= 60) return "text-yellow-500";
    return "text-red-500";
  };

  const getStatusIcon = (run: AnalysisRun) => {
    if (run.overall_score !== null && run.overall_score !== undefined) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    }
    if (run.status === "failed") {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
    return <Clock className="h-5 w-5 text-gray-400" />;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-background border border-border rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h2 className="text-2xl font-bold">Analysis History</h2>
              <p className="text-sm text-muted-foreground mt-1">{repoName}</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-accent rounded-lg transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                <p className="text-muted-foreground">Loading analysis history...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{error}</p>
                <Button onClick={loadHistory} variant="outline" className="mt-4">
                  Retry
                </Button>
              </div>
            ) : history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No analysis history yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Run an analysis to see it here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((run, index) => (
                  <motion.div
                    key={run.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={`p-4 rounded-lg border ${
                      index === 0
                        ? "border-primary bg-primary/5"
                        : "border-border bg-card hover:bg-accent/50"
                    } transition-colors cursor-pointer group`}
                    onClick={() => handleViewAnalysis(run.id)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-0.5">
                          {getStatusIcon(run)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">
                              {formatDate(run.completed_at)}
                            </span>
                            {index === 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                                Latest
                              </span>
                            )}
                          </div>
                          
                          {run.overall_score !== null && run.overall_score !== undefined ? (
                            <div className="mt-2 flex flex-wrap gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Score:</span>{" "}
                                <span className={`font-semibold ${getScoreColor(run.overall_score)}`}>
                                  {run.overall_score}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Issues:</span>{" "}
                                <span className="font-semibold">{run.total_issues}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Security:</span>{" "}
                                <span className={getScoreColor(run.security_score)}>
                                  {run.security_score ?? "N/A"}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Quality:</span>{" "}
                                <span className={getScoreColor(run.quality_score)}>
                                  {run.quality_score ?? "N/A"}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-2 text-sm text-muted-foreground">
                              {run.status === "failed" ? "Analysis failed" : "Analysis incomplete"}
                            </div>
                          )}
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewAnalysis(run.id);
                        }}
                      >
                        View Results →
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-border bg-muted/30">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {history.length > 0 
                  ? `Showing ${history.length} analysis run${history.length === 1 ? '' : 's'}`
                  : 'No analysis runs'}
              </span>
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
