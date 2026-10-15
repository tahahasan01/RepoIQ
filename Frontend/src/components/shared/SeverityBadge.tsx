import { cn } from "@/lib/utils";
import { normalizeSeverity, severityLabel, type Severity } from "@/lib/findings";

const TONES: Record<Severity, string> = {
  critical: "border-sev-critical/30 bg-sev-critical/10 text-sev-critical",
  high: "border-sev-high/30 bg-sev-high/10 text-sev-high",
  medium: "border-sev-medium/30 bg-sev-medium/10 text-sev-medium",
  low: "border-sev-low/30 bg-sev-low/10 text-sev-low",
};

const DOTS: Record<Severity, string> = {
  critical: "bg-sev-critical",
  high: "bg-sev-high",
  medium: "bg-sev-medium",
  low: "bg-sev-low",
};

interface SeverityBadgeProps {
  severity: string | null | undefined;
  className?: string;
}

/**
 * A finding's severity. Always the word, with the hue as a second channel:
 * colour alone does not survive colour blindness, greyscale print or a quick
 * glance.
 */
export function SeverityBadge({ severity, className }: SeverityBadgeProps) {
  const value = normalizeSeverity(severity);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium",
        TONES[value],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", DOTS[value])} aria-hidden="true" />
      {severityLabel(value)}
    </span>
  );
}

export default SeverityBadge;
