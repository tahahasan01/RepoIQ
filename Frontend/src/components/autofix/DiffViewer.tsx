import { useMemo } from "react";
import { Minus, Plus } from "lucide-react";
import { diffStats, parseUnifiedDiff, type DiffLine } from "@/lib/diff";
import { cn } from "@/lib/utils";

const ROW_STYLE: Record<DiffLine["kind"], string> = {
  add: "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
  del: "bg-red-500/10 text-red-900 dark:text-red-200",
  context: "text-foreground",
  hunk: "bg-muted text-muted-foreground",
  meta: "text-muted-foreground italic",
};

function Marker({ kind }: { kind: DiffLine["kind"] }) {
  // The icon and the +/- prefix carry the meaning; colour only reinforces it.
  if (kind === "add") {
    return (
      <>
        <Plus className="h-3 w-3 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        <span className="sr-only">Added: </span>
      </>
    );
  }
  if (kind === "del") {
    return (
      <>
        <Minus className="h-3 w-3 text-red-600 dark:text-red-400" aria-hidden="true" />
        <span className="sr-only">Removed: </span>
      </>
    );
  }
  return null;
}

/** A unified diff with old/new line numbers, +/- markers and a scrollable body. */
export function DiffViewer({ diff, label }: { diff: string; label: string }) {
  const lines = useMemo(() => parseUnifiedDiff(diff), [diff]);
  const stats = useMemo(() => diffStats(lines), [lines]);

  if (lines.length === 0) {
    return <p className="text-xs text-muted-foreground">No changes in this file.</p>;
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="flex items-center justify-end gap-3 border-b border-border bg-muted/40 px-3 py-1 font-mono text-xs">
        <span className="text-emerald-700 dark:text-emerald-400">+{stats.added}</span>
        <span className="text-red-700 dark:text-red-400">−{stats.removed}</span>
        <span className="sr-only">
          {stats.added} lines added, {stats.removed} lines removed
        </span>
      </div>
      <div
        role="region"
        aria-label={label}
        tabIndex={0}
        className="max-h-96 overflow-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <table className="w-full border-collapse font-mono text-xs leading-5">
          <tbody>
            {lines.map((line, i) => (
              <tr key={i} className={ROW_STYLE[line.kind]}>
                <td className="w-10 select-none border-r border-border/60 px-2 text-right align-top text-muted-foreground/80">
                  {line.oldNumber ?? ""}
                </td>
                <td className="w-10 select-none border-r border-border/60 px-2 text-right align-top text-muted-foreground/80">
                  {line.newNumber ?? ""}
                </td>
                <td className="w-6 select-none px-1 align-top">
                  <span className="flex h-5 items-center justify-center">
                    <Marker kind={line.kind} />
                  </span>
                </td>
                <td className="whitespace-pre pr-4 align-top">
                  <span aria-hidden="true" className="select-none">
                    {line.kind === "add" ? "+" : line.kind === "del" ? "-" : line.kind === "context" ? " " : ""}
                  </span>
                  {line.text || " "}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DiffViewer;
