import { Github, Loader2, AlertCircle, FileSearch, Gauge, GitPullRequestDraft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useState, useEffect, type ReactNode } from "react";
import { startGitHubFlow } from "@/lib/githubAuth";
import { Logo } from "@/components/Logo";

// Three things RepoIQ actually does - no rotating quotes.
const PRODUCT_FACTS = [
  { icon: FileSearch, text: "Every finding names the file and line it was found on." },
  { icon: Gauge, text: "Scores are calculated from the findings, so you can see what moved them." },
  { icon: GitPullRequestDraft, text: "Fixes open as draft pull requests, and only after you approve the diff." },
];

/** The sign-in and sign-up pages share this frame. */
export function AuthPageLayout({ children }: { children: ReactNode }) {
  return (
    // Theme-aware: every surface and text colour comes from the theme tokens.
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex items-center justify-center border-r border-border bg-muted/30">
        <div className="w-full max-w-md px-12 space-y-10">
          <div className="space-y-3">
            <Link to="/" className="inline-flex rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Logo size="lg" />
            </Link>
            <p className="text-muted-foreground">AI code review for GitHub repositories.</p>
          </div>
          <ul className="space-y-5">
            {PRODUCT_FACTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3">
                <Icon className="h-5 w-5 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-foreground">{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <main className="flex items-center justify-center px-4 sm:px-6 py-12 min-w-0">
        <div className="w-full max-w-md">
          <Link
            to="/"
            className="md:hidden inline-flex mb-8 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Logo />
          </Link>
          <div className="bg-card rounded-xl border border-border p-6 sm:p-10">{children}</div>
        </div>
      </main>
    </div>
  );
}

export default function Login() {
  const [isLoading, setIsLoading] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();

  const errorParam = searchParams.get("error");
  const [showError, setShowError] = useState(!!errorParam);

  useEffect(() => {
    if (!errorParam) return;
    setShowError(true);
    // Clear error from URL after showing it. Cleared on unmount so it cannot
    // fire after the user has already navigated away.
    const timer = setTimeout(() => {
      setSearchParams({});
      setShowError(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [errorParam, setSearchParams]);

  const getErrorMessage = (error: string) => {
    switch (error) {
      case "auth_expired":
        return "Authentication session expired. Please try logging in again.";
      case "oauth_failed":
        return "GitHub authentication was cancelled or failed.";
      case "no_code":
        return "Invalid authentication response. Please try again.";
      case "callback_failed":
        return "Authentication failed. Please try again.";
      case "install_requested":
        return "Your request to install RepoIQ was sent to the organization's owners. Sign in once it has been approved.";
      case "logout_incomplete":
        return "You're signed out on this device, but the server couldn't confirm your session was ended. It will expire on its own.";
      case "state_mismatch":
        return "That GitHub sign-in link wasn't started from this browser, so it was ignored. Please sign in again.";
      case "github_unavailable":
        return "Couldn't reach GitHub sign-in. Please try again.";
      default:
        return "An error occurred during login. Please try again.";
    }
  };

  const handleGitHubLogin = async () => {
    setIsLoading(true);
    try {
      // Sign-in leaves the site, which loses router state, so the page that
      // sent the user here (ProtectedRoute's state.from) is remembered across
      // the round trip. Without one, a destination recorded when the session
      // expired is kept.
      const from = (location.state as { from?: unknown } | null)?.from;
      await startGitHubFlow("signin", { returnTo: typeof from === "string" ? from : undefined });
    } catch (err) {
      console.error("GitHub auth url failed", err);
      setIsLoading(false);
      setSearchParams({ error: "github_unavailable" });
    }
  };

  return (
    <AuthPageLayout>
      <h1 className="text-2xl font-bold text-foreground">Sign in to RepoIQ</h1>
      <p className="text-muted-foreground mt-2">Use the GitHub account you signed up with.</p>

      {showError && errorParam && (
        <div role="alert" className="mt-4 p-4 bg-destructive/10 border border-destructive/30 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-foreground">{getErrorMessage(errorParam)}</p>
        </div>
      )}

      <div className="mt-8 space-y-6">
        <Button size="lg" className="w-full gap-3 h-12 text-base" onClick={handleGitHubLogin} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Connecting…
            </>
          ) : (
            <>
              <Github className="h-5 w-5" aria-hidden="true" />
              Continue with GitHub
            </>
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          New to RepoIQ?{" "}
          <Link to="/signup" className="text-link font-medium underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
