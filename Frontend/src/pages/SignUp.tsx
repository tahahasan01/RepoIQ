import { Loader2, Github } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { startGitHubFlow } from "@/lib/githubAuth";
import { AuthPageLayout } from "./Login";

export default function SignUp() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleGitHubOnly = async () => {
    setIsLoading(true);
    try {
      // A new account in GitHub App mode has to install the app before it can
      // see any repository. Starting at the install page skips the
      // authorise -> "not installed" (409) -> install bounce that sign-in would
      // take; GitHub then returns to the callback, which finishes sign-in.
      // OAuth mode has no install page and uses the sign-in URL. Returning
      // users belong on the sign-in page, which always uses the sign-in URL.
      await startGitHubFlow("install", { returnTo: null });
    } catch {
      setIsLoading(false);
      toast({ title: "Couldn't start GitHub sign-up", description: "Please try again.", variant: "destructive" });
    }
  };

  return (
    <AuthPageLayout>
      <h1 className="text-2xl font-bold text-foreground">Create your RepoIQ account</h1>
      <p className="text-muted-foreground mt-2">
        You'll install the RepoIQ GitHub App and choose which repositories it can read.
      </p>
      <div className="mt-8 space-y-6">
        <Button size="lg" className="w-full gap-3 h-12 text-base" onClick={handleGitHubOnly} disabled={isLoading}>
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
          Already have an account?{" "}
          <Link to="/login" className="text-link font-medium underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthPageLayout>
  );
}
