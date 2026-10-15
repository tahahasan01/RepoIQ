import { useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, GitBranch, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GitHubAccessNotice } from "@/components/GitHubAccessNotice";
import { useArchitecture } from "@/hooks/useApiQueries";
import { isGitHubAccessError } from "@/lib/apiErrors";

/**
 * The diagram arrives as plain text (box-drawing characters, generated from
 * the repository's file layout), often wrapped in a markdown code fence.
 * Shown as preformatted text; nothing in it is interpreted.
 */
function stripCodeFence(diagram: string): string {
  const trimmed = diagram.trim();
  const fenced = /^```[\w-]*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return (fenced ? fenced[1] : trimmed).replace(/\s+$/, "");
}

export function ArchitecturePanel({ repoId }: { repoId: string }) {
  const { data, isLoading, isError, error, refetch, isFetching } = useArchitecture(repoId);
  const [copied, setCopied] = useState(false);
  const diagram = useMemo(() => (data?.diagram ? stripCodeFence(data.diagram) : ""), [data]);

  if (isLoading) {
    return (
      <div className="py-16 text-center" role="status">
        <RefreshCw className="mx-auto mb-3 h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">Drawing the architecture from the file layout…</p>
      </div>
    );
  }

  if (isGitHubAccessError(error)) {
    return <GitHubAccessNotice kind={error.kind} message={error.message} />;
  }

  if (isError || !diagram) {
    return (
      <div className="py-16 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="mb-1 text-base font-medium text-foreground">Couldn't draw the architecture</p>
        <p className="mb-4 text-sm text-muted-foreground">
          {error instanceof Error && error.message ? error.message : "The diagram came back empty."} Try again.
        </p>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagram);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitBranch className="h-4 w-4" aria-hidden="true" />
          Generated from {data?.file_count?.toLocaleString() ?? "the"} files in the default branch. It shows how the
          code is organised, not traced calls.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={copy} className="gap-1.5">
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
            <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
            Regenerate
          </Button>
        </div>
      </div>
      <pre
        tabIndex={0}
        aria-label={`Architecture diagram of ${data?.repository_name ?? "the repository"}`}
        className="max-h-[600px] overflow-auto rounded-lg border border-border bg-muted/40 p-4 font-mono text-xs leading-snug text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {diagram}
      </pre>
    </div>
  );
}

export default ArchitecturePanel;
