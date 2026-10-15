import { cn } from "@/lib/utils";
import { splitPath } from "@/lib/findings";

interface FilePathProps {
  path: string | null | undefined;
  line?: number | null;
  /** Show the folder under the file name (default true). */
  showFolder?: boolean;
  className?: string;
}

/**
 * A file reference: the file name (and :line) in mono, its folder underneath in
 * small muted mono, the full path in the tooltip. Both lines truncate, so a
 * deep path never pushes a table column or card sideways.
 */
export function FilePath({ path, line, showFolder = true, className }: FilePathProps) {
  const { name, folder } = splitPath(path);
  const lineSuffix = line ? `:${line}` : "";
  const full = `${path || ""}${lineSuffix}`;

  return (
    <div className={cn("min-w-0", className)} title={full}>
      <div className="truncate font-mono text-sm font-medium text-foreground">
        {`${name || "unknown"}${lineSuffix}`}
      </div>
      {showFolder && folder && (
        <div className="truncate font-mono text-xs text-muted-foreground">{folder}</div>
      )}
    </div>
  );
}

export default FilePath;
