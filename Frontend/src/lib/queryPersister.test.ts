import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { persistQueryCache } from "@/lib/queryPersister";

const KEY = "repoiq_cache_u1";
const MINUTE = 60 * 1000;

function store(queries: Record<string, unknown>) {
  localStorage.setItem(KEY, JSON.stringify({ queries, timestamp: Date.now() }));
}

describe("persistQueryCache restore", () => {
  let stop: (() => void) | undefined;

  beforeEach(() => localStorage.clear());
  afterEach(() => {
    stop?.();
    localStorage.clear();
  });

  it("keeps each query's real age, so old data is revalidated on mount", () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 10 * MINUTE } } });
    const old = Date.now() - 30 * MINUTE;
    const recent = Date.now() - MINUTE;
    store({
      [JSON.stringify(["repositories", 1, 30])]: { data: ["a"], dataUpdatedAt: old },
      [JSON.stringify(["batchAnalysis"])]: { data: { results: {} }, dataUpdatedAt: recent },
    });

    stop = persistQueryCache(client, "u1");

    const repos = client.getQueryCache().find({ queryKey: ["repositories", 1, 30] })!;
    const batch = client.getQueryCache().find({ queryKey: ["batchAnalysis"] })!;
    expect(repos.state.data).toEqual(["a"]);
    expect(repos.state.dataUpdatedAt).toBe(old);
    expect(repos.isStaleByTime(10 * MINUTE)).toBe(true);
    expect(batch.isStaleByTime(10 * MINUTE)).toBe(false);
  });

  it("treats an entry saved without a timestamp as stale", () => {
    const client = new QueryClient();
    store({ [JSON.stringify(["currentUser"])]: { data: { id: "u1" } } });

    stop = persistQueryCache(client, "u1");

    const query = client.getQueryCache().find({ queryKey: ["currentUser"] })!;
    expect(query.state.data).toEqual({ id: "u1" });
    expect(query.isStaleByTime(60 * MINUTE)).toBe(true);
  });
});
