import { useState } from "react";
import { useLocation } from "react-router-dom";
import { Github, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { startGitHubFlow } from "@/lib/githubAuth";
import type { GitHubAccessKind } from "@/lib/apiErrors";

const COPY: Record<GitHubAccessKind, { title: string; action: string; flow: "signin" | "install" }> = {
  github_disconnected: {
    title: "GitHub is not connected",
    action: "Connect GitHub",
    flow: "signin",
  },
  github_not_installed: {
    title: "The RepoIQ GitHub App is not installed",
    action: "Install the GitHub App",
    flow: "install",
  },
  github_unavailable: {
    title: "RepoIQ can't reach your GitHub account",
    action: "Reconnect GitHub",
    flow: "signin",
  },
};

/**
 * Shown where a request failed because GitHub access is missing (a 403 from
 * the backend's GitHub token check). The user is still signed in to RepoIQ;
 * what they need is a way to connect GitHub or install the app, and this
 * gives them one. The round trip returns them to the current page.
 */
export function GitHubAccessNotice({
  kind,
  message,
  className,
}: {
  kind: GitHubAccessKind;
  /** The backend's explanation, when there is one. */
  message?: string | null;
  className?: string;
}) {
  const location = useLocation();
  const { toast } = useToast();
  const [starting, setStarting] = useState(false);
  const copy = COPY[kind];

  const handleAction = async () => {
    setStarting(true);
    try {
      await startGitHubFlow(copy.flow, { returnTo: location.pathname + location.search });
    } catch (err) {
      setStarting(false);
      toast({
        title: "Couldn't start GitHub",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <Alert className={className}>
      <Github className="h-4 w-4" />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription className="space-y-3">
        <p>{message || "Connect GitHub to see and analyze your repositories."}</p>
        <Button size="sm" onClick={handleAction} disabled={starting} className="gap-2">
          {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
          {copy.action}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export default GitHubAccessNotice;
