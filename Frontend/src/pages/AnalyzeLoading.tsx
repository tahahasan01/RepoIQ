import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import apiClient from "@/lib/api";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

export default function AnalyzeLoading() {
  const { id: repoId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<string>("in_progress");
  const [message, setMessage] = useState<string>("Starting analysis...");

  const analysisIdFromState = (location.state as any)?.analysisId as string | undefined;

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (!repoId) return;
      try {
        const results = await apiClient.getAnalysisResults(repoId).catch(() => null);
        if (!mounted) return;
        if (!results) {
          setStatus("in_progress");
          setMessage("Analysis in progress...");
          setTimeout(poll, 3000);
          return;
        }

        if (results.status === "in_progress") {
          setStatus("in_progress");
          setMessage("Analysis in progress...");
          setTimeout(poll, 3000);
          return;
        }

        if (results.status === "completed") {
          setStatus("completed");
          setMessage("Analysis completed. Redirecting...");
          // small delay so user sees completion
            // notify other parts of the app that analysis finished
            try {
              window.dispatchEvent(new CustomEvent('analysisCompleted', { detail: { repoId } }));
            } catch {}

            setTimeout(() => {
              navigate(`/dashboard/${repoId}`);
            }, 800);
          return;
        }

        if (results.status === "failed") {
          setStatus("failed");
          setMessage(results.error_message || "Analysis failed");
          return;
        }

        // default
        setTimeout(poll, 3000);
      } catch (err) {
        console.error("AnalyzeLoading polling error:", err);
        setMessage("Network error while checking analysis status");
        setTimeout(poll, 5000);
      }
    };

    poll();

    return () => { mounted = false; };
  }, [repoId, navigate]);

  return (
    <DashboardLayout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <h2 className="text-lg font-semibold">{status === "in_progress" ? "Analyzing repository" : status === "completed" ? "Analysis complete" : "Analysis status"}</h2>
          <p className="text-muted-foreground">{message}</p>
        </div>
      </div>
    </DashboardLayout>
  );
}
