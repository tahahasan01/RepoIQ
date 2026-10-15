import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { ApiRequestError } from "@/lib/apiErrors";

const api = vi.hoisted(() => ({ getImprovementRoadmap: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api, apiClient: api }));

import { RoadmapPanel } from "@/components/docs/RoadmapPanel";

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RoadmapPanel repoId="repo-1" />
      </MemoryRouter>
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

  it("puts findings in fix first / next / later, with totals and a link to the rest", async () => {
    api.getImprovementRoadmap.mockResolvedValue({
      priority_order: ["critical", "high", "medium", "low"],
      quick_wins: [
        { issue: "Hard-coded secret", category: "hardcoded_secret", severity: "high", area: "security",
          file_path: "app/config.py", line_number: 12 },
      ],
      medium_term: [
        { issue: "N+1 query", category: "n_plus_one", severity: "medium", area: "quality" },
        { issue: "Missing auth check", category: "missing_auth", severity: "medium", area: "security" },
      ],
      long_term: [],
      estimated_impact: {
        critical_issues: 0, high_issues: 1, medium_issues: 14, low_issues: 0,
        fix_first_total: 1, next_total: 14, later_total: 0,
      },
    });
    renderPanel();

    const first = await screen.findByRole("region", { name: "Fix first" });
    expect(within(first).getByText("Hard-coded secret")).toBeInTheDocument();
    expect(within(first).getByText("config.py:12")).toBeInTheDocument();
    expect(within(first).getByText("Hardcoded secret")).toBeInTheDocument();
    const next = screen.getByRole("region", { name: "Next" });
    expect(within(next).getByText("14")).toBeInTheDocument();
    expect(within(next).getByRole("link", { name: "12 more in Issues" })).toHaveAttribute(
      "href",
      "/dashboard/repo-1/issues"
    );
    expect(within(screen.getByRole("region", { name: "Later" })).getByText("Nothing left after the above.")).toBeInTheDocument();
  });
});
