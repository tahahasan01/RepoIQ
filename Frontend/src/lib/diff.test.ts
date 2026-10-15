import { describe, it, expect } from "vitest";
import { classifyDiffLine, diffStats, parseUnifiedDiff } from "@/lib/diff";

const DIFF = [
  "diff --git a/src/db.py b/src/db.py",
  "index 3b18e51..a9c2f40 100644",
  "--- a/src/db.py",
  "+++ b/src/db.py",
  "@@ -10,4 +10,4 @@ def get_user(user_id):",
  "     conn = connect()",
  '-    cur.execute(f"SELECT * FROM users WHERE id = {user_id}")',
  '+    cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))',
  "     return cur.fetchone()",
  "--- old comment line",
  "+++ new comment line",
  "\\ No newline at end of file",
  "",
].join("\n");

describe("parseUnifiedDiff", () => {
  const lines = parseUnifiedDiff(DIFF);

  it("classifies headers, hunks, additions, removals and context", () => {
    expect(lines.map((l) => l.kind)).toEqual([
      "meta",
      "meta",
      "meta",
      "meta",
      "hunk",
      "context",
      "del",
      "add",
      "context",
      // Inside a hunk "--- x" / "+++ x" are a removed "-- x" and an added "++ x".
      "del",
      "add",
      "meta",
    ]);
  });

  it("strips the marker and numbers lines from the hunk header", () => {
    expect(lines[5]).toMatchObject({ text: "    conn = connect()", oldNumber: 10, newNumber: 10 });
    expect(lines[6]).toMatchObject({ kind: "del", oldNumber: 11 });
    expect(lines[6].newNumber).toBeUndefined();
    expect(lines[6].text.startsWith("    cur.execute(f")).toBe(true);
    expect(lines[7]).toMatchObject({ kind: "add", newNumber: 11 });
    expect(lines[7].oldNumber).toBeUndefined();
    expect(lines[8]).toMatchObject({ oldNumber: 12, newNumber: 12 });
    expect(lines[9]).toMatchObject({ kind: "del", text: "-- old comment line" });
  });

  it("counts changes", () => {
    expect(diffStats(lines)).toEqual({ added: 2, removed: 2 });
  });

  it("handles CRLF and empty input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
    expect(parseUnifiedDiff("@@ -1 +1 @@\r\n-a\r\n+b\r\n").map((l) => l.kind)).toEqual(["hunk", "del", "add"]);
  });

  it("resets hunk state at each file in a multi-file diff", () => {
    const multi = parseUnifiedDiff("@@ -1 +1 @@\n-a\n+b\ndiff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -5 +5 @@\n-c\n+d");
    expect(multi.map((l) => l.kind)).toEqual(["hunk", "del", "add", "meta", "meta", "meta", "hunk", "del", "add"]);
    expect(multi[7].oldNumber).toBe(5);
  });
});

describe("classifyDiffLine", () => {
  it("treats file headers as metadata only outside a hunk", () => {
    expect(classifyDiffLine("--- a/file", false)).toBe("meta");
    expect(classifyDiffLine("--- a/file", true)).toBe("del");
    expect(classifyDiffLine("+++ b/file", true)).toBe("add");
    expect(classifyDiffLine(" unchanged", true)).toBe("context");
  });
});
