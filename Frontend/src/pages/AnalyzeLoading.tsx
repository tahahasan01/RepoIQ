import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Loader2 } from "lucide-react";
import { useNotificationStore, startBackgroundAnalysisPolling } from "@/stores/notificationStore";

/**
 * This page is now a simple redirect handler.
 * Analysis no longer shows a dedicated loading page - it runs in background
 * from the Repositories page with auto-navigation when complete.
 * 
 * If someone navigates here directly (e.g., via URL), we redirect them:
 * - If there's an active analysis for this repo, show brief message and let polling handle it
 * - Otherwise, redirect to dashboard or repos page
 */
export default function AnalyzeLoading() {
  const { id: repoId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { backgroundAnalyses } = useNotificationStore();
  
  useEffect(() => {
    // Start background polling
    startBackgroundAnalysisPolling();
    
    if (!repoId) {
      // No repo ID, go to repos
      navigate('/repos', { replace: true });
      return;
    }
    
    // Check if there's an active analysis for this repo
    const bgAnalysis = backgroundAnalyses.get(repoId);
    
    if (bgAnalysis && (bgAnalysis.status === 'in_progress' || bgAnalysis.status === 'prefetching')) {
      // There's an active analysis - the background polling will handle navigation
      // Just wait here briefly then redirect to repos page (user can see progress there)
      const timer = setTimeout(() => {
        navigate('/repos', { replace: true });
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      // No active analysis - redirect to dashboard (may have cached results)
      navigate(`/dashboard/${repoId}`, { replace: true });
    }
  }, [repoId, navigate, backgroundAnalyses]);

  return (
    <DashboardLayout>
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
          <p className="text-lg font-medium">Redirecting...</p>
          <p className="text-sm text-muted-foreground">
            Analysis runs in the background. You'll be redirected to the dashboard when ready.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}
