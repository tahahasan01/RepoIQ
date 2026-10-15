/**
 * Unified diff parsing for the auto-fix review screen.
 *
 * Each line is classified so the viewer can mark it with a prefix and an
 * icon as well as a colour (colour alone is not enough to tell an added line
 * from a removed one), and numbered against the old and new file from the
 * hunk headers.
 */

export type DiffLineKind = "add" | "del" | "context" | "hunk" | "meta";

export interface DiffLine {
  kind: DiffLineKind;
  /** The line without its leading +, - or space marker. */
  text: string;
  /** Line number in the original file (context and removed lines). */
  oldNumber?: number;
  /** Line number in the updated file (context and added lines). */
  newNumber?: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// File headers and git metadata. "--- " / "+++ " only count as headers
// before the first hunk; inside a hunk they are a removed "-- " line or an
// added "++ " line.
const META_PREFIXES = ["diff --git", "index ", "new file mode", "deleted file mode", "similarity index", "rename from", "rename to", "Binary files"];

export function classifyDiffLine(line: string, inHunk: boolean): DiffLineKind {
  if (line.startsWith("@@")) return "hunk";
  if (!inHunk) {
    if (line.startsWith("--- ") || line.startsWith("+++ ")) return "meta";
    if (META_PREFIXES.some((prefix) => line.startsWith(prefix))) return "meta";
  }
  if (line.startsWith("\\")) return "meta"; // "\ No newline at end of file"
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "context";
}

export function parseUnifiedDiff(diff: string): DiffLine[] {
  if (!diff) return [];
  const rawLines = diff.replace(/\r\n/g, "\n").split("\n");
  // A trailing newline leaves one empty string that is not a line of the diff.
  if (rawLines.length > 0 && rawLines[rawLines.length - 1] === "") rawLines.pop();

  const lines: DiffLine[] = [];
  let inHunk = false;
  let oldNo = 0;
  let newNo = 0;

  for (const raw of rawLines) {
    // A new file section inside a multi-file diff resets the hunk state.
    if (raw.startsWith("diff --git")) inHunk = false;

    const kind = classifyDiffLine(raw, inHunk);
    switch (kind) {
      case "hunk": {
        const match = HUNK_HEADER.exec(raw);
        if (match) {
          oldNo = Number(match[1]);
          newNo = Number(match[2]);
        }
        inHunk = true;
        lines.push({ kind, text: raw });
        break;
      }
      case "add":
        lines.push({ kind, text: raw.slice(1), newNumber: newNo++ });
        break;
      case "del":
        lines.push({ kind, text: raw.slice(1), oldNumber: oldNo++ });
        break;
      case "context":
        lines.push({
          kind,
          text: raw.startsWith(" ") ? raw.slice(1) : raw,
          oldNumber: inHunk ? oldNo++ : undefined,
          newNumber: inHunk ? newNo++ : undefined,
        });
        break;
      default:
        lines.push({ kind, text: raw });
    }
  }
  return lines;
}

export function diffStats(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "add") added++;
    else if (line.kind === "del") removed++;
  }
  return { added, removed };
}
