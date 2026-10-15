import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiRequestError } from "@/lib/apiErrors";

const api = vi.hoisted(() => ({ getImprovementRoadmap: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api, apiClient: api }));

import { RoadmapPanel } from "@/components/docs/RoadmapPanel";

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RoadmapPanel repoId="repo-1" />
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("RoadmapPanel", () => {
  it("explains that a roadmap needs an analysis when there is none (404)", async () => {
    api.getImprovementRoadmap.mockRejectedValue(
      new ApiRequestError("No roadmap found. Please complete an analysis first.", 404, "http")
    );
    renderPanel();
    expect(await screen.findByText("No roadmap yet")).toBeInTheDocument();
  });

  it("groups items into quick wins, medium and long term with counts", async () => {
    api.getImprovementRoadmap.mockResolvedValue({
      priority_order: ["critical", "high", "medium", "low"],
      quick_wins: [{ issue: "Hard-coded secret", category: "security", impact: "high", effort: "low" }],
      medium_term: [
        { issue: "N+1 query", category: "performance", impact: "high", effort: "medium" },
        { issue: "Missing auth check", category: "security", impact: "high", effort: "medium" },
      ],
      long_term: [],
      estimated_impact: { critical_issues: 3, high_issues: 7, architecture_issues: 0, auto_fixable: 1 },
    });
    renderPanel();

    const quick = await screen.findByRole("region", { name: "Quick wins" });
    expect(within(quick).getByText("Hard-coded secret")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Medium term" })).getByText("2")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Long term" })).getByText("No architecture issues.")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });
});
