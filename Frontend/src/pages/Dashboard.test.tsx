import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({
  getAnalysisResults: vi.fn(),
  getAnalysisById: vi.fn(),
  getAnalysisHistory: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ default: api, apiClient: api }));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import Dashboard from "@/pages/Dashboard";

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard/r1"]}>
      <Routes>
        <Route path="/dashboard/:id" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.getAnalysisResults.mockResolvedValue({
    id: "a1",
    status: "completed",
    overall_score: 72,
    security_score: 75,
    quality_score: 79,
    architecture_score: 80,
    documentation_score: 64,
    issues: [
      {
        id: 7,
        file_path: "app/config.py",
        line_number: 12,
        severity: "high",
        category: "hardcoded_secret",
        agent_type: "security",
        description: "A secret key is committed.",
      },
    ],
  });
  api.getAnalysisHistory.mockResolvedValue({
    history: [
      {
        id: "a1",
        completed_at: "2026-10-01T10:00:00Z",
        overall_score: 72,
        security_score: 75,
        quality_score: 79,
        architecture_score: 80,
        total_issues: 1,
      },
    ],
  });
});

describe("Dashboard", () => {
  it("shows a loading state, then the scores", async () => {
    renderDashboard();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Loading analysis");
    expect(await screen.findByText("Docs")).toBeInTheDocument();
    expect(screen.getAllByText("(Good)", { exact: false })).toHaveLength(1); // Architecture 80
    expect(screen.getByRole("link", { name: "About scores" })).toHaveAttribute("href", "/docs#scores");
  });

  it("links each recent issue to that finding on the Issues page", async () => {
    renderDashboard();
    const link = await screen.findByRole("link", { name: /config\.py:12/ });
    expect(link).toHaveAttribute("href", "/dashboard/r1/issues?finding=7");
    expect(screen.getByRole("link", { name: "View all" })).toHaveAttribute("href", "/dashboard/r1/issues");
  });

  it("labels each score in the analysis history", async () => {
    renderDashboard();
    const run = await screen.findByRole("link", { name: /Run 1/ });
    expect(run).toHaveTextContent("Security 75");
    expect(run).toHaveTextContent("Quality 79");
    expect(run).toHaveTextContent("Architecture 80");
    expect(run).toHaveTextContent("1 issue");
  });
});
