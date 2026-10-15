import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api";
import { ApiRequestError, detailMessage } from "@/lib/apiErrors";
import { startGitHubFlow } from "@/lib/githubAuth";
import { consumePostLoginRedirect } from "@/lib/redirect";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { clearRepositoryCaches, queryKeys } from "@/hooks/useApiQueries";
import { useRepositoryStore } from "@/stores/repositoryStore";

// Set when we bounce a code-less return from GitHub back through sign-in, so a
// second code-less return cannot loop forever.
const SETUP_RESUME_KEY = "repoiq_github_setup_resume";
const SETUP_RESUME_WINDOW_MS = 2 * 60 * 1000;

function readToken(): string | null {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

function tokenUserId(token: string | null): string | undefined {
  if (!token) return undefined;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload?.sub || payload?.user_id || payload?.id;
  } catch {
    return undefined;
  }
}

function recentlyResumedSetup(): boolean {
  try {
    const at = Number(sessionStorage.getItem(SETUP_RESUME_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < SETUP_RESUME_WINDOW_MS;
  } catch {
    return false;
  }
}

function markSetupResume(active: boolean) {
  try {
    if (active) sessionStorage.setItem(SETUP_RESUME_KEY, String(Date.now()));
    else sessionStorage.removeItem(SETUP_RESUME_KEY);
  } catch {
    // Storage unavailable: worst case a code-less return is not retried.
  }
}

/**
 * Landing page for every GitHub round trip: sign-in, re-authorisation from
 * Settings, and returning from installing or configuring the GitHub App.
 *
 * Fixes over the previous version:
 *  - It returned early whenever a token already existed, so a signed-in user
 *    coming back from installing the app or re-authorising never had their
 *    `code`/`installation_id` sent, and the installation was never recorded.
 *    A callback carrying `code` is now always processed.
 *  - Arriving with only `installation_id`/`setup_action` (GitHub's setup
 *    redirect after an install or a repository-access change) went to
 *    /login?error=no_code. It now goes through sign-in once more, which
 *    returns a code so the backend can record the installation.
 *  - Errors were read as `err.response.data.detail` (an axios shape apiClient
 *    never produces), so "expired" was never detected.
 *  - It always went to /repos; it now honours the page the user was heading to.
 */
export default function GitHubCallback() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { login } = useAuth();
  const { toast } = useToast();
  const hasRun = useRef(false);
  const [status, setStatus] = useState("Connecting to GitHub...");

  useEffect(() => {
    // Prevent double execution (StrictMode, re-renders): a code is single-use.
    if (hasRun.current) return;
    hasRun.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    // Present in GitHub App mode after an install or a configuration change.
    const installationId = params.get("installation_id");
    const setupAction = params.get("setup_action");
    const error = params.get("error");

    const existingToken = readToken();
    const signedIn = Boolean(existingToken);

    // Clear the parameters immediately so a refresh cannot replay the code.
    window.history.replaceState({}, document.title, window.location.pathname);

    const goToDestination = () => navigate(consumePostLoginRedirect(), { replace: true });

    // A signed-in user whose GitHub round trip went wrong keeps their RepoIQ
    // session: tell them and send them back, rather than to the login page.
    const failSignedIn = (title: string, description: string) => {
      toast({ title, description, variant: "destructive" });
      goToDestination();
    };

    const handleCallback = async () => {
      if (error) {
        console.error("[GitHub OAuth] Error:", error);
        if (signedIn) {
          failSignedIn("GitHub access was not changed", "The request was cancelled or declined on GitHub.");
        } else {
          navigate("/login?error=oauth_failed", { replace: true });
        }
        return;
      }

      if (!code) {
        if (setupAction === "request") {
          // An organization owner has to approve the installation first.
          const message = "Your request to install RepoIQ was sent to the organization's owners.";
          if (signedIn) {
            toast({ title: "Installation requested", description: message });
            goToDestination();
          } else {
            navigate("/login?error=install_requested", { replace: true });
          }
          return;
        }

        if (installationId || setupAction) {
          // Back from installing or reconfiguring the app, without an
          // authorization code. Sign in once more: GitHub skips the prompt for
          // a user who has already authorised, and the code it returns lets the
          // backend record the installation against this account.
          if (recentlyResumedSetup()) {
            markSetupResume(false);
            if (signedIn) {
              failSignedIn("Couldn't finish GitHub setup", "Please try connecting GitHub again.");
            } else {
              navigate("/login?error=no_code", { replace: true });
            }
            return;
          }
          try {
            setStatus("Finishing GitHub setup...");
            markSetupResume(true);
            await startGitHubFlow("signin");
          } catch (err) {
            markSetupResume(false);
            console.error("[GitHub OAuth] Could not restart sign-in:", err);
            if (signedIn) {
              failSignedIn("Couldn't finish GitHub setup", "Please try connecting GitHub again.");
            } else {
              navigate("/login?error=callback_failed", { replace: true });
            }
          }
          return;
        }

        if (signedIn) {
          // A reload of this page after a completed sign-in.
          goToDestination();
          return;
        }

        console.error("[GitHub OAuth] No code in callback");
        navigate("/login?error=no_code", { replace: true });
        return;
      }

      const resumedSetup = recentlyResumedSetup();
      markSetupResume(false);

      try {
        setStatus("Authenticating...");
        const response = await apiClient.githubCallback(code, state, installationId);

        // Read before anything below clears session storage.
        const destination = consumePostLoginRedirect();

        // A different GitHub identity than the current session: drop the
        // previous user's local data before storing the new session, and load
        // the destination with a full page load so nothing of theirs survives
        // in memory either.
        const previousUserId = tokenUserId(existingToken);
        const newUserId = response.user?.id || tokenUserId(response.access_token);
        const switchedAccount = Boolean(previousUserId && newUserId && previousUserId !== newUserId);
        if (switchedAccount) {
          apiClient.clearLocalSession();
        }

        localStorage.setItem("token", response.access_token);
        if (response.refresh_token) {
          localStorage.setItem("refresh_token", response.refresh_token);
        }
        if (response.user) {
          login(response.user, response.access_token, response.refresh_token);
        }

        if (switchedAccount) {
          window.location.assign(destination);
          return;
        }

        // Which repositories are reachable may have changed (new installation,
        // repositories added or removed, reconnect after a disconnect).
        clearRepositoryCaches(queryClient);
        queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });

        setStatus("Loading your repositories...");
        navigate(destination, { replace: true });

        // Background work after navigation. After an installation change the
        // stored list has to be re-synced from GitHub to pick up new repos.
        setTimeout(() => {
          const store = useRepositoryStore.getState();
          const refresh = installationId || resumedSetup ? store.syncRepositories() : store.loadRepositories(1, true);
          refresh.catch(() => {});
        }, 0);

        if (!response.user) {
          apiClient
            .getCurrentUser()
            .then((user) => login(user, response.access_token, response.refresh_token))
            .catch((err) => console.error("[GitHub OAuth] Failed to fetch user in background:", err));
        }
      } catch (err) {
        const detail = err instanceof ApiRequestError ? err.detail : undefined;

        // Authorised but the GitHub App is not installed: a normal first-run
        // state. Send the user to install it rather than to an error.
        if (detail && typeof detail === "object") {
          const { action, install_url: installUrl } = detail as { action?: unknown; install_url?: unknown };
          if (action === "install" && typeof installUrl === "string" && installUrl) {
            setStatus("Redirecting to install RepoIQ on GitHub...");
            window.location.assign(installUrl);
            return;
          }
        }

        console.error("[GitHub OAuth] Callback failed:", err);
        const message = detailMessage(detail) || (err instanceof Error ? err.message : "");
        const expired = /expired|no longer valid/i.test(message);

        if (signedIn) {
          failSignedIn(
            "Couldn't update GitHub access",
            expired ? "The GitHub link expired. Please try again." : message || "Please try again."
          );
          return;
        }

        // Make sure no partial session is left behind. (Only the tokens: the
        // remembered destination should survive for the next attempt.)
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        navigate(`/login?error=${expired ? "auth_expired" : "callback_failed"}`, { replace: true });
      }
    };

    handleCallback();
    // Runs once per visit; `hasRun` guards against a second pass.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
