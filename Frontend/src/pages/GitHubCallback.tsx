import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useRepositoryStore } from "@/stores/repositoryStore";

export default function GitHubCallback() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const hasRun = useRef(false);
  const [status, setStatus] = useState("Connecting to GitHub...");

  useEffect(() => {
    // Prevent double execution
    if (hasRun.current) return;
    hasRun.current = true;

    const handleCallback = async () => {
      // Check if already authenticated (page refresh after login)
      const existingToken = localStorage.getItem("token");
      if (existingToken) {
        console.log("[GitHub OAuth] Already authenticated, redirecting...");
        navigate("/repos", { replace: true });
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      // Present only in GitHub App mode, after a fresh installation.
      const installationId = params.get("installation_id");
      const error = params.get("error");

      if (error) {
        console.error("[GitHub OAuth] Error:", error);
        navigate("/login?error=oauth_failed", { replace: true });
        return;
      }

      if (!code) {
        console.error("[GitHub OAuth] No code in callback");
        navigate("/login?error=no_code", { replace: true });
        return;
      }

      try {
        setStatus("Authenticating...");
        console.log("[GitHub OAuth] Exchanging code for token...");
        
        // Clear the URL parameters immediately to prevent reuse
        window.history.replaceState({}, document.title, window.location.pathname);
        
        const startTime = performance.now();
        const response = await apiClient.githubCallback(code, state, installationId);
        console.log(`[GitHub OAuth] Token exchange took ${Math.round(performance.now() - startTime)}ms`);
        
        // Store tokens IMMEDIATELY
        localStorage.setItem("token", response.access_token);
        if (response.refresh_token) {
          localStorage.setItem("refresh_token", response.refresh_token);
        }

        setStatus("Loading your repositories...");

        // Store user data immediately if available
        if (response.user) {
          login(response.user, response.access_token, response.refresh_token);
        }

        // Navigate IMMEDIATELY - don't wait for prefetch
        // Repos will load on the repos page itself (much faster perceived performance)
        console.log("[GitHub OAuth] ✅ Auth complete - instant navigation");
        navigate("/repos", { replace: true });
        
        // Start prefetch in background AFTER navigation (non-blocking)
        setTimeout(() => {
          useRepositoryStore.getState().loadRepositories(1, true).catch(() => {});
        }, 0);

        // Fetch user data in background if not already available
        if (!response.user) {
          apiClient.getCurrentUser().then(user => {
            login(user, response.access_token, response.refresh_token);
          }).catch(err => {
            console.error("[GitHub OAuth] Failed to fetch user in background:", err);
          });
        }
      } catch (err: any) {
        // Signed in, but the GitHub App is not installed yet. That is a normal
        // first-run state rather than an error: send the user to install it
        // instead of dropping them on the login page with a failure message.
        const detail = err?.detail ?? err?.response?.data?.detail;
        if (detail?.action === "install" && detail?.install_url) {
          setStatus("Redirecting to install RepoIQ on GitHub...");
          window.location.href = detail.install_url;
          return;
        }

        console.error("[GitHub OAuth] Callback failed:", err);
        // Clear any partially stored data
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        
        // Provide more specific error message
        const errorMsg = err.response?.data?.detail?.includes("expired") 
          ? "auth_expired" 
          : "callback_failed";
        navigate(`/login?error=${errorMsg}`, { replace: true });
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">{status}</p>
      </div>
    </div>
  );
}
