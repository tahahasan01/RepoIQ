import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  /** "md" for headers, "sm" for the dashboard sidebar, "lg" for sign-in pages. */
  size?: "sm" | "md" | "lg";
  /** Hide the wordmark (collapsed sidebar). The mark alone is labelled "RepoIQ". */
  markOnly?: boolean;
}

const MARK = { sm: "h-8 w-8", md: "h-9 w-9", lg: "h-10 w-10" } as const;
const ICON = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-5 w-5" } as const;
const WORD = { sm: "text-lg", md: "text-xl", lg: "text-2xl" } as const;

/**
 * The RepoIQ mark and wordmark. Wrap it in a link where it should navigate;
 * the component itself is not interactive.
 */
export function Logo({ className, size = "md", markOnly = false }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        className={cn(
          "shrink-0 rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center",
          MARK[size],
        )}
        aria-hidden={markOnly ? undefined : true}
        role={markOnly ? "img" : undefined}
        aria-label={markOnly ? "RepoIQ" : undefined}
      >
        <Zap className={cn(ICON[size], "text-primary-foreground")} aria-hidden="true" />
      </span>
      {!markOnly && (
        <span className={cn("font-bold whitespace-nowrap", WORD[size])}>
          Repo<span className="gradient-text">IQ</span>
        </span>
      )}
    </span>
  );
}

export default Logo;
