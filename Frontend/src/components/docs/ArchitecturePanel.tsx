import { useEffect, useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Copy, GitBranch, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingState } from "@/components/shared/LoadingState";
import { Button } from "@/components/ui/button";
import { GitHubAccessNotice } from "@/components/GitHubAccessNotice";
import { queryKeys, useArchitecture } from "@/hooks/useApiQueries";
import apiClient from "@/lib/api";
import { isGitHubAccessError } from "@/lib/apiErrors";

/** Follows the app's theme class on <html>, so the diagram re-renders in the right colours. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark"))
    );
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

/**
 * Renders Mermaid text to SVG. Mermaid (~600 kB) is loaded only here, when the
 * Architecture tab is opened. securityLevel "strict" encodes HTML in labels
 * and disables click handlers; the text is also built server-side from
 * validated data, never taken from the model verbatim.
 */
function MermaidDiagram({ source, label }: { source: string; label: string }) {
  const dark = useIsDark();
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        // RepoIQ's palette rather than Mermaid's defaults (yellow clusters,
        // purple nodes); edge labels get a background so lines don't cross
        // the text.
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: dark
            ? {
                primaryColor: "#0e2a33",
                primaryBorderColor: "#22d3ee",
                primaryTextColor: "#e2e8f0",
                clusterBkg: "#0f172a",
                clusterBorder: "#334155",
                titleColor: "#e2e8f0",
                lineColor: "#94a3b8",
                edgeLabelBackground: "#0b1220",
                textColor: "#cbd5e1",
              }
            : {
                primaryColor: "#ecfeff",
                primaryBorderColor: "#0891b2",
                primaryTextColor: "#0f172a",
                clusterBkg: "#f8fafc",
                clusterBorder: "#cbd5e1",
                titleColor: "#0f172a",
                lineColor: "#64748b",
                edgeLabelBackground: "#ffffff",
                textColor: "#334155",
              },
          // edgeLabelBackground only reaches HTML labels; SVG labels need CSS.
          themeCSS: `.edgeLabel rect, .labelBkg { fill: ${dark ? "#0b1220" : "#ffffff"} !important; opacity: 1 !important; }`,
          flowchart: {
            htmlLabels: false,
            curve: "basis",
            padding: 16,
            nodeSpacing: 32,
            rankSpacing: 48,
            wrappingWidth: 420,
            // Sizing is left to CSS: fit the panel on desktop, scroll at full
            // size on phones instead of shrinking the text away.
            useMaxWidth: false,
          },
          fontFamily: "inherit",
        });
        const { svg: rendered } = await mermaid.render(`arch${id}`, source);
        if (!cancelled) {
          setSvg(rendered);
          setFailed(false);
        }
      } catch (err) {
        console.warn("[Architecture] Mermaid render failed", err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, dark, id]);

  if (failed) {
    return <p className="text-sm text-muted-foreground">The diagram couldn't be drawn; the layers are listed below.</p>;
  }
  if (!svg) {
    return (
      <div className="py-6">
        <Skeleton className="mx-auto h-48 w-full max-w-xl" aria-hidden="true" />
        <p className="mt-3 text-center text-sm text-muted-foreground" role="status">
          Drawing the diagram…
        </p>
      </div>
    );
  }
  return (
    <div
      role="img"
      aria-label={label}
      className="overflow-x-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-none md:[&_svg]:max-w-full"
      // SECURITY: Mermaid's own SVG. Labels are escaped server-side
      // (app/services/architecture.py), "strict" encodes HTML in them and
      // disables scripts/click handlers, and Mermaid passes its output
      // through DOMPurify before returning it.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function ArchitecturePanel({ repoId }: { repoId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error, refetch, isFetching } = useArchitecture(repoId);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const architecture = data?.architecture;
  const layers = architecture?.layers ?? [];

  if (isLoading) {
    return (
      <div className="py-6">
        <LoadingState variant="list" count={3} label="Working out the architecture from the file layout" />
        <p className="mt-3 text-center text-sm text-muted-foreground" aria-hidden="true">
          Working out the architecture from the file layout…
        </p>
      </div>
    );
  }

  if (isGitHubAccessError(error)) {
    return <GitHubAccessNotice kind={error.kind} message={error.message} />;
  }

  if (isError || layers.length === 0) {
    return (
      <EmptyState
        variant="error"
        title="Couldn't describe the architecture"
        body={`${error instanceof Error && error.message ? error.message : "Nothing came back for this repository."} Try again.`}
        onRetry={() => refetch()}
        retrying={isFetching}
      />
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(data?.mermaid ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  // Regenerate asks the server to skip its cached overview; a plain refetch
  // would only return the same cached one.
  const regenerate = async () => {
    setRegenerating(true);
    try {
      const fresh = await apiClient.getArchitectureDiagram(repoId, true);
      queryClient.setQueryData(queryKeys.architecture(repoId), fresh);
    } catch (err) {
      console.warn("[Architecture] Regenerate failed", err);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl space-y-1">
          {architecture?.summary && <p className="text-sm text-foreground">{architecture.summary}</p>}
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
            {architecture?.source === "file_layout"
              ? "Drawn from the folder structure only; the AI overview was unavailable."
              : `Described from the ${data?.file_count?.toLocaleString() ?? ""} files in the default branch. It shows how the code is organised, not traced calls.`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={copy} className="gap-1.5" title="Copy as Mermaid (GitHub renders it in Markdown)">
            {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            {copied ? "Copied" : "Copy Mermaid"}
          </Button>
          <Button size="sm" variant="outline" onClick={regenerate} disabled={regenerating} className="gap-1.5">
            <RefreshCw className={regenerating ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
            Regenerate
          </Button>
        </div>
      </div>

      {data?.mermaid && (
        <div className="rounded-lg border border-border bg-muted/20 p-4">
          <MermaidDiagram
            source={data.mermaid}
            label={`Architecture of ${data.repository_name ?? "the repository"}: ${layers.map((l) => l.name).join(", ")}`}
          />
        </div>
      )}

      {/* The same information as text: readable at any width, searchable, and
          carries the descriptions and paths the diagram leaves out. */}
      <div className="grid gap-4 md:grid-cols-2">
        {layers.map((layer) => (
          <section key={layer.id} className="rounded-lg border border-border p-4">
            <h4 className="font-medium text-foreground">{layer.name}</h4>
            {layer.description && <p className="mt-0.5 text-sm text-muted-foreground">{layer.description}</p>}
            {layer.components.length > 0 && (
              <ul className="mt-3 space-y-2.5">
                {layer.components.map((component) => (
                  <li key={component.name} className="text-sm">
                    <span className="font-medium text-foreground">{component.name}</span>
                    {component.description && (
                      <span className="text-muted-foreground"> — {component.description}</span>
                    )}
                    {component.paths.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {component.paths.map((path) => (
                          <code key={path} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                            {path}
                          </code>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

export default ArchitecturePanel;
