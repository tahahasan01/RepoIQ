import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiRequestError } from "@/lib/apiErrors";
import type { ChatMessage } from "@/types/assistant";

const api = vi.hoisted(() => ({
  sendChatMessage: vi.fn(),
  getChatHistory: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ default: api, apiClient: api }));

import { queryKeys, useSendChatMessage } from "@/hooks/useApiQueries";

const existing: ChatMessage = {
  id: "m1",
  role: "assistant",
  content: "Earlier answer",
  context_files: [],
  created_at: "2026-10-01T10:00:00Z",
};

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(queryKeys.chatHistory("repo-1"), [existing]);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useSendChatMessage("repo-1"), { wrapper });
  const history = () => queryClient.getQueryData<ChatMessage[]>(queryKeys.chatHistory("repo-1"));
  return { hook, history };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getChatHistory.mockImplementation(() => new Promise(() => {})); // refetches stay pending
});

describe("useSendChatMessage", () => {
  it("shows the question at once, then appends the reply", async () => {
    let resolve!: (reply: ChatMessage) => void;
    api.sendChatMessage.mockImplementation(() => new Promise<ChatMessage>((r) => (resolve = r)));
    const { hook, history } = setup();

    act(() => {
      hook.result.current.mutate({ message: "Why is security low?", contextFiles: ["src/app.ts"] });
    });

    await waitFor(() => expect(history()).toHaveLength(2));
    const optimistic = history()![1];
    expect(optimistic).toMatchObject({ role: "user", content: "Why is security low?", pending: true });
    expect(optimistic.context_files).toEqual(["src/app.ts"]);
    expect(api.sendChatMessage).toHaveBeenCalledWith("repo-1", "Why is security low?", ["src/app.ts"]);

    await act(async () => {
      resolve({ id: "m3", role: "assistant", content: "Because…", created_at: "2026-10-01T10:01:00Z" });
    });

    await waitFor(() => expect(history()).toHaveLength(3));
    expect(history()![1].pending).toBe(false);
    expect(history()![2]).toMatchObject({ id: "m3", role: "assistant", content: "Because…" });
  });

  it("removes the question again when sending fails", async () => {
    api.sendChatMessage.mockRejectedValue(
      new ApiRequestError("Daily AI usage limit reached. It resets within 24 hours.", 429, "http")
    );
    const { hook, history } = setup();

    act(() => {
      hook.result.current.mutate({ message: "Hello" });
    });

    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(history()).toEqual([existing]);
    expect(api.sendChatMessage).toHaveBeenCalledTimes(1); // never retried
  });
});
