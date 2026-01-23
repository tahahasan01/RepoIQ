import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import apiClient from "@/lib/api";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertCircle, CheckCircle, Loader2, X } from "lucide-react";

export default function AnalyzeLoading() {
  const { id: repoId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<string>("starting");
  const [message, setMessage] = useState<string>("Initializing analysis...");
  const [errorDetails, setErrorDetails] = useState<string>("");
  const [pollCount, setPollCount] = useState<number>(0);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [analysisId, setAnalysisId] = useState<string | undefined>(
    (location.state as any)?.analysisId as string | undefined
  );

  const handleCancel = async () => {
    if (!analysisId) {
      console.warn('[AnalyzeLoading] No analysis ID to cancel');
      return;
    }
    
    setIsCancelling(true);
    try {
      console.log('[AnalyzeLoading] Cancelling analysis:', analysisId);
      await apiClient.cancelAnalysis(analysisId);
      setStatus("cancelled");
      setMessage("Analysis cancelled");
      console.log('[AnalyzeLoading] Analysis cancelled successfully');
    } catch (err: any) {
      console.error('[AnalyzeLoading] Failed to cancel analysis:', err);
      setErrorDetails(err?.message || "Failed to cancel analysis");
    } finally {
      setIsCancelling(false);
    }
  };

  const handleRetry = async () => {
    if (!repoId) return;
    setIsRetrying(true);
    setStatus("starting");
    setMessage("Retrying analysis...");
    setErrorDetails("");
    setPollCount(0);
    
    try {
      console.log('[AnalyzeLoading] Retrying analysis for repo:', repoId);
      const response = await apiClient.startAnalysis(repoId);
      console.log('[AnalyzeLoading] Retry successful:', response);
      setStatus("in_progress");
      setMessage("Analysis restarted successfully...");
    } catch (err: any) {
      console.error('[AnalyzeLoading] Retry failed:', err);
      setStatus("failed");
      setMessage("Failed to restart analysis");
      setErrorDetails(err?.message || "Unknown error");
    } finally {
      setIsRetrying(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    let timeoutId: NodeJS.Timeout;

    const poll = async () => {
      if (!repoId) return;
      
      setPollCount(prev => prev + 1);
      const currentPollCount = pollCount + 1;
      
      // Timeout after 5 minutes (100 polls * 3 seconds)
      if (currentPollCount > 100) {
        console.warn('[AnalyzeLoading] Analysis timeout after 5 minutes');
        setStatus("failed");
        setMessage("Analysis timed out");
        setErrorDetails("The analysis is taking longer than expected. Please try again or check backend logs.");
        return;
      }

      try {
        console.log(`[AnalyzeLoading] Poll #${currentPollCount} for repo ${repoId}`);
        const results = await apiClient.getAnalysisResults(repoId).catch((err) => {
          console.warn('[AnalyzeLoading] Analysis not found yet:', err?.message);
          return null;
        });
        
        if (!mounted) return;

        if (!results) {
          setStatus("starting");
          setMessage(`Waiting for analysis to start... (${currentPollCount}s)`);
          timeoutId = setTimeout(poll, 3000);
          return;
        }

        // Store analysis ID if we have it
        if (results.id && !analysisId) {
          setAnalysisId(results.id);
        }

        console.log(`[AnalyzeLoading] Poll #${currentPollCount} status:`, results.status);
        
        // Check if cancelled
        if (results.status === "cancelled") {
          setStatus("cancelled");
          setMessage("Analysis was cancelled");
          return;
        }

        if (results.status === "in_progress") {
          setStatus("in_progress");
          const elapsed = currentPollCount * 3;
          setMessage(`Analyzing repository... (${elapsed}s elapsed)`);
          timeoutId = setTimeout(poll, 3000);
          return;
        }

        if (results.status === "completed") {
          setStatus("completed");
          setMessage("✓ Analysis completed successfully!");
          console.log('[AnalyzeLoading] Analysis completed, redirecting to dashboard');
          
          // Notify other parts of the app that analysis finished
          try {
            window.dispatchEvent(new CustomEvent('analysisCompleted', { detail: { repoId } }));
          } catch (e) {
            console.error('[AnalyzeLoading] Failed to dispatch analysisCompleted event:', e);
          }

          setTimeout(() => {
            navigate(`/dashboard/${repoId}`);
          }, 800);
          return;
        }

        if (results.status === "failed") {
          setStatus("failed");
          const errorMsg = results.error_message || "Analysis failed for unknown reason";
          setMessage("✗ Analysis failed");
          setErrorDetails(errorMsg);
          console.error('[AnalyzeLoading] Analysis failed:', errorMsg);
          return;
        }

        // Unknown status - continue polling
        console.warn('[AnalyzeLoading] Unknown status:', results.status);
        timeoutId = setTimeout(poll, 3000);
        
      } catch (err: any) {
        console.error("[AnalyzeLoading] Polling error:", err);
        
        if (!mounted) return;

        // Network error - continue retrying
        setMessage(`Network error - retrying... (attempt ${currentPollCount})`);
        timeoutId = setTimeout(poll, 5000);
      }
    };

    poll();

    return () => { 
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [repoId, navigate, isRetrying, analysisId]);

  return (
    <DashboardLayout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-6 max-w-md">
          {/* Icon/Status Indicator */}
          {status === "starting" || status === "in_progress" ? (
            <Loader2 className="h-16 w-16 text-primary animate-spin mx-auto" />
          ) : status === "completed" ? (
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          ) : status === "failed" ? (
            <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
          ) : null}

          {/* Title */}
          <h2 className="text-2xl font-bold">
            {status === "starting" && "Initializing Analysis"}
            {status === "in_progress" && "Analyzing Repository"}
            {status === "completed" && "Analysis Complete!"}
            {status === "failed" && "Analysis Failed"}
            {status === "cancelled" && "Analysis Cancelled"}
          </h2>

          {/* Message */}
          <p className="text-muted-foreground text-lg">{message}</p>

          {/* Error Details */}
          {errorDetails && (
            <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-left">
              <p className="text-sm font-semibold text-destructive mb-2">Error Details:</p>
              <p className="text-sm text-muted-foreground font-mono whitespace-pre-wrap break-words">
                {errorDetails}
              </p>
            </div>
          )}

          {/* Progress Info */}
          {(status === "starting" || status === "in_progress") && (
            <div className="text-sm text-muted-foreground space-y-2 mt-4">
              <p>⏱️ Estimated time: 60-90 seconds</p>
              <p>📊 Poll count: {pollCount}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-center mt-6">
            {(status === "starting" || status === "in_progress") && (
              <Button
                onClick={handleCancel}
                disabled={isCancelling || !analysisId}
                variant="destructive"
                className="gap-2"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" />
                    Cancel Analysis
                  </>
                )}
              </Button>
            )}
            
            {status === "failed" && (
              <>
                <Button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  variant="default"
                  className="gap-2"
                >
                  {isRetrying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Retrying...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Retry Analysis
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => navigate('/repos')}
                  variant="outline"
                >
                  Back to Repositories
                </Button>
              </>
            )}
            
            {status === "cancelled" && (
              <Button
                onClick={() => navigate('/repos')}
                variant="outline"
              >
                Back to Repositories
              </Button>
            )}
            
            {status === "completed" && (
              <p className="text-sm text-muted-foreground">Redirecting to dashboard...</p>
            )}
          </div>

          {/* Help Text */}
          {status === "failed" && (
            <div className="mt-6 p-4 bg-muted/50 rounded-lg text-left">
              <p className="text-sm font-semibold mb-2">💡 Troubleshooting:</p>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Check if the backend server is running</li>
                <li>Verify your GitHub token has repository access</li>
                <li>Check backend console logs for detailed errors</li>
                <li>Ensure the repository exists and is accessible</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
