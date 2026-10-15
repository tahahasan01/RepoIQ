/**
 * Repository chat helpers: the optimistic history updates used while a
 * question is in flight, and the user-facing message for a failed request.
 */
import { ApiRequestError } from "@/lib/apiErrors";
import type { ChatMessage } from "@/types/assistant";

/** Attachments per question, matching ChatMessageRequest.context_files. */
export const MAX_CHAT_FILES = 3;
/** ChatMessageRequest.message max_length. */
export const MAX_CHAT_MESSAGE_LENGTH = 8000;

let optimisticCounter = 0;

export function createOptimisticMessage(
  content: string,
  contextFiles: string[],
  now: Date = new Date()
): ChatMessage {
  optimisticCounter += 1;
  return {
    id: `optimistic-${now.getTime()}-${optimisticCounter}`,
    role: "user",
    content,
    context_files: contextFiles,
    created_at: now.toISOString(),
    pending: true,
  };
}

/** The history with the unconfirmed question appended. */
export function withOptimisticMessage(
  history: readonly ChatMessage[] | undefined,
  message: ChatMessage
): ChatMessage[] {
  return [...(history ?? []), message];
}

/**
 * The history once the server answered: the question is confirmed and the
 * reply follows it. The backend writes both rows together and returns only the
 * reply, so the question keeps its temporary id until the next refetch.
 */
export function withConfirmedReply(
  history: readonly ChatMessage[] | undefined,
  optimisticId: string,
  reply: ChatMessage | null | undefined
): ChatMessage[] {
  const confirmed = (history ?? []).map((m) =>
    m.id === optimisticId ? { ...m, pending: false } : m
  );
  if (reply && reply.id && !confirmed.some((m) => m.id === reply.id)) {
    confirmed.push({ ...reply, role: "assistant" });
  }
  return confirmed;
}

/** The history without a question that failed to send. */
export function withoutMessage(
  history: readonly ChatMessage[] | undefined,
  optimisticId: string
): ChatMessage[] {
  return (history ?? []).filter((m) => m.id !== optimisticId);
}

export const CHAT_BLOCKED_FILE_MESSAGE =
  "One of the attached files can't be sent to the AI (for example .env files or private keys). Remove it and try again.";
export const CHAT_NETWORK_MESSAGE = "Couldn't reach RepoIQ. Check your connection and try again.";
export const CHAT_GENERIC_MESSAGE = "Your question wasn't sent. Try again in a moment.";

/** What to tell the user when sending a question failed. */
export function chatErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 429) {
      return error.message && !error.message.startsWith("HTTP ")
        ? error.message
        : "Daily AI usage limit reached. It resets within 24 hours.";
    }
    if (error.kind === "blocked_file") return CHAT_BLOCKED_FILE_MESSAGE;
    if (error.status >= 500) return CHAT_GENERIC_MESSAGE;
    return error.message || CHAT_GENERIC_MESSAGE;
  }
  if (error && typeof error === "object" && (error as { isNetworkError?: boolean }).isNetworkError) {
    return CHAT_NETWORK_MESSAGE;
  }
  if (error && typeof error === "object" && (error as { isCorsError?: boolean }).isCorsError) {
    return CHAT_NETWORK_MESSAGE;
  }
  return CHAT_GENERIC_MESSAGE;
}

/** The file paths from the repository files response, whatever its wrapper. */
export function extractFilePaths(data: unknown): string[] {
  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { files?: unknown[] }).files)
      ? (data as { files: unknown[] }).files
      : [];
  const paths = new Set<string>();
  for (const entry of list) {
    const path =
      typeof entry === "string"
        ? entry
        : entry && typeof entry === "object"
          ? ((entry as { path?: unknown }).path ?? (entry as { name?: unknown }).name)
          : undefined;
    if (typeof path === "string" && path.length > 1 && !path.startsWith("...")) {
      paths.add(path);
    }
  }
  return Array.from(paths).sort((a, b) => a.localeCompare(b));
}
