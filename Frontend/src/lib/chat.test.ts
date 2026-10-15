import { describe, it, expect } from "vitest";
import { ApiRequestError, errorFromResponse } from "@/lib/apiErrors";
import {
  CHAT_BLOCKED_FILE_MESSAGE,
  CHAT_GENERIC_MESSAGE,
  CHAT_NETWORK_MESSAGE,
  chatErrorMessage,
  createOptimisticMessage,
  extractFilePaths,
  withConfirmedReply,
  withOptimisticMessage,
  withoutMessage,
} from "@/lib/chat";
import type { ChatMessage } from "@/types/assistant";

const base: ChatMessage[] = [
  { id: "a", role: "user", content: "Q", created_at: "2026-10-01T00:00:00Z" },
  { id: "b", role: "assistant", content: "A", created_at: "2026-10-01T00:00:01Z" },
];

describe("optimistic chat history", () => {
  it("appends, confirms and rolls back without touching other messages", () => {
    const pending = createOptimisticMessage("New question", ["x.ts"]);
    expect(pending.pending).toBe(true);

    const optimistic = withOptimisticMessage(base, pending);
    expect(optimistic.map((m) => m.id)).toEqual(["a", "b", pending.id]);
    expect(base).toHaveLength(2); // not mutated

    const reply: ChatMessage = { id: "c", role: "assistant", content: "Answer", created_at: "2026-10-01T00:00:03Z" };
    const confirmed = withConfirmedReply(optimistic, pending.id, reply);
    expect(confirmed.map((m) => m.id)).toEqual(["a", "b", pending.id, "c"]);
    expect(confirmed[2].pending).toBe(false);

    // A refetch that already brought the reply does not duplicate it.
    expect(withConfirmedReply(confirmed, pending.id, reply)).toHaveLength(4);

    expect(withoutMessage(optimistic, pending.id)).toEqual(base);
  });

  it("copes with an empty cache", () => {
    const pending = createOptimisticMessage("Q", []);
    expect(withOptimisticMessage(undefined, pending)).toEqual([pending]);
    expect(withoutMessage(undefined, pending.id)).toEqual([]);
  });

  it("gives every optimistic message its own id", () => {
    const now = new Date("2026-10-01T00:00:00Z");
    expect(createOptimisticMessage("a", [], now).id).not.toBe(createOptimisticMessage("b", [], now).id);
  });
});

describe("chatErrorMessage", () => {
  it("shows the daily AI limit message from the backend", () => {
    const error = errorFromResponse(429, "Daily AI usage limit reached. It resets within 24 hours.");
    expect(chatErrorMessage(error)).toBe("Daily AI usage limit reached. It resets within 24 hours.");
  });

  it("explains a blocked attachment", () => {
    const error = errorFromResponse(403, "Access to this file type is not allowed");
    expect(chatErrorMessage(error)).toBe(CHAT_BLOCKED_FILE_MESSAGE);
  });

  it("explains a network failure", () => {
    const error = Object.assign(new Error("Network Error: Unable to reach the backend server."), {
      isNetworkError: true,
    });
    expect(chatErrorMessage(error)).toBe(CHAT_NETWORK_MESSAGE);
  });

  it("hides server internals behind a generic message", () => {
    expect(chatErrorMessage(new ApiRequestError("Traceback…", 500, "http"))).toBe(CHAT_GENERIC_MESSAGE);
  });

  it("passes through authored 4xx messages", () => {
    expect(chatErrorMessage(errorFromResponse(400, "Invalid file path: path traversal not allowed"))).toBe(
      "Invalid file path: path traversal not allowed"
    );
  });
});

describe("extractFilePaths", () => {
  it("reads the {files} wrapper, drops junk entries and sorts", () => {
    expect(
      extractFilePaths({
        files: [{ path: "src/b.ts" }, { path: "src/a.ts" }, "README.md", { path: "... and 3 more" }, { path: "src/a.ts" }],
      })
    ).toEqual(["README.md", "src/a.ts", "src/b.ts"]);
  });

  it("handles a bare array and unexpected shapes", () => {
    expect(extractFilePaths([{ name: "x.py" }])).toEqual(["x.py"]);
    expect(extractFilePaths(null)).toEqual([]);
    expect(extractFilePaths({ nope: true })).toEqual([]);
  });
});
