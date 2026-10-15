import { useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { AREA_LABELS, findingArea, formatCategory, type FindingArea } from "@/lib/findings";
import { FilePath } from "./FilePath";
import { SeverityBadge } from "./SeverityBadge";

export interface FindingRowData {
  id: number | string;
  file: string;
  line?: number | null;
  severity: string;
  /** The finding's category, e.g. "missing_rate_limiting". */
  type: string;
  /** Which score it counts against; defaults to quality, like the backend. */
  area?: FindingArea | string | null;
  description: string;
}

/** Longer descriptions get clamped to three lines with a "more" toggle. */
export const DESCRIPTION_CLAMP_CHARS = 180;

interface FindingRowProps {
  finding: FindingRowData;
  /**
   * row: a <tr> for the md+ findings table.
   * card: a stacked card for narrow screens (render inside a list).
   * compact: a one-block summary that links to the finding (dashboard lists).
   */
  variant: "row" | "card" | "compact";
  selected?: boolean;
  /** Open the finding (row/card). Click and Enter/Space both call it. */
  onOpen?: () => void;
  /** compact only: where the summary links to. */
  href?: string;
  /** Selection control (a checkbox), rendered first. */
  checkbox?: ReactNode;
  /** Trailing actions (buttons). */
  actions?: ReactNode;
  className?: string;
}

function FindingMeta({ finding }: { finding: FindingRowData }) {
  const area = findingArea(finding.area ?? undefined);
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
      <span className="font-medium text-foreground/80">{AREA_LABELS[area]}</span>
      <span aria-hidden="true">·</span>
      <span>{formatCategory(finding.type)}</span>
    </div>
  );
}

function Description({ text, clamp = true }: { text: string; clamp?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = clamp && text.length > DESCRIPTION_CLAMP_CHARS;
  return (
    <div>
      <p className={cn("text-sm text-foreground", long && !expanded && "line-clamp-3")}>{text}</p>
      {long && (
        <button
          type="button"
          className="mt-0.5 rounded-sm text-xs font-medium text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={expanded}
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {expanded ? "Less" : "More"}
        </button>
      )}
    </div>
  );
}

/** Stops clicks in a slot (checkbox, actions) from also opening the finding. */
function Slot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={className}
      onClick={(e: MouseEvent) => e.stopPropagation()}
      onKeyDown={(e: KeyboardEvent) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}

function openOnKey(onOpen?: () => void) {
  return (e: KeyboardEvent<HTMLElement>) => {
    if (!onOpen || e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen();
    }
  };
}

/**
 * One analysis finding: where it is, how severe, what is wrong, and which
 * score it counts against. The same content in three shapes, so the Issues
 * table, its phone layout and the dashboard summary never drift apart.
 */
export function FindingRow({
  finding,
  variant,
  selected = false,
  onOpen,
  href,
  checkbox,
  actions,
  className,
}: FindingRowProps) {
  const label = `${finding.file}${finding.line ? ` line ${finding.line}` : ""}: ${finding.description}`;

  if (variant === "compact") {
    const body = (
      <>
        <div className="flex items-start justify-between gap-3">
          <FilePath path={finding.file} line={finding.line} className="flex-1" />
          <SeverityBadge severity={finding.severity} />
        </div>
        <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{finding.description}</p>
        <div className="mt-1.5">
          <FindingMeta finding={finding} />
        </div>
      </>
    );
    const classes = cn(
      "block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      className,
    );
    return href ? (
      <Link to={href} className={classes}>
        {body}
      </Link>
    ) : (
      <div className={classes}>{body}</div>
    );
  }

  if (variant === "card") {
    return (
      <li
        tabIndex={onOpen ? 0 : undefined}
        aria-label={onOpen ? label : undefined}
        aria-current={selected ? "true" : undefined}
        onClick={onOpen}
        onKeyDown={openOnKey(onOpen)}
        className={cn(
          "rounded-lg border p-3 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          onOpen && "cursor-pointer",
          selected ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          {checkbox && <Slot className="pt-0.5">{checkbox}</Slot>}
          <FilePath path={finding.file} line={finding.line} className="flex-1" />
          <SeverityBadge severity={finding.severity} />
        </div>
        <div className="mt-2 space-y-1.5">
          <Description text={finding.description} />
          <FindingMeta finding={finding} />
        </div>
        {actions && <Slot className="mt-2 flex justify-end gap-2">{actions}</Slot>}
      </li>
    );
  }

  return (
    <tr
      tabIndex={onOpen ? 0 : undefined}
      aria-label={onOpen ? label : undefined}
      aria-current={selected ? "true" : undefined}
      onClick={onOpen}
      onKeyDown={openOnKey(onOpen)}
      className={cn(
        "border-b border-border/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        onOpen && "cursor-pointer",
        selected ? "bg-primary/5" : "hover:bg-muted/40",
        className,
      )}
    >
      <td className="w-10 p-3 align-top">{checkbox && <Slot>{checkbox}</Slot>}</td>
      <td className="w-[13rem] max-w-[14rem] p-3 align-top">
        <FilePath path={finding.file} line={finding.line} />
      </td>
      <td className="p-3 align-top">
        <SeverityBadge severity={finding.severity} />
      </td>
      <td className="min-w-[16rem] p-3 align-top">
        <div className="space-y-1.5">
          <Description text={finding.description} />
          <FindingMeta finding={finding} />
        </div>
      </td>
      <td className="p-3 text-right align-top">{actions && <Slot className="inline-flex gap-2">{actions}</Slot>}</td>
    </tr>
  );
}

export default FindingRow;
