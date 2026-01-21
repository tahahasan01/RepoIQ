import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import apiClient from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export default function GitHubCallback() {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const error = params.get("error");

      if (error) {
        console.error("[GitHub OAuth] Error:", error);
        navigate("/login?error=oauth_failed");
        return;
      }

      if (!code) {
        console.error("[GitHub OAuth] No code in callback");
        navigate("/login?error=no_code");
        return;
      }

      try {
        console.log("[GitHub OAuth] Exchanging code for token...");
        const response = await apiClient.githubCallback(code);
        
        // Store tokens
        localStorage.setItem("token", response.access_token);
        if (response.refresh_token) {
          localStorage.setItem("refresh_token", response.refresh_token);
        }

        // Fetch user data
        const user = await apiClient.getCurrentUser();
        login(user, response.access_token);

        console.log("[GitHub OAuth] Success! Redirecting to repos...");
        navigate("/repos");
      } catch (err) {
        console.error("[GitHub OAuth] Callback failed:", err);
        navigate("/login?error=callback_failed");
      }
    };

    handleCallback();
  }, [navigate, login]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-muted-foreground">Completing GitHub authentication...</p>
      </div>
    </div>
  );
}
