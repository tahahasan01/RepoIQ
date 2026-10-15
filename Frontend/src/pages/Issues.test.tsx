import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { ReactNode } from "react";

const api = vi.hoisted(() => ({ getAnalysisResults: vi.fn(), getIssues: vi.fn() }));
vi.mock("@/lib/api", () => ({ default: api, apiClient: api }));
vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/autofix/AutofixSheet", () => ({ AutofixSheet: () => null }));
vi.mock("@/hooks/useApiQueries", () => ({
  useAutoFixIssues: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null }),
  useAutofixRun: () => ({ data: undefined }),
}));

import Issues from "@/pages/Issues";

const ISSUES = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    file_path: "app/config.py",
    line_number: 12,
    severity: "high",
    category: "hardcoded_secret",
    agent_type: "security",
    description: "A secret key is committed.",
    suggestion: "Read it from the environment.",
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    file_path: "app/db.py",
    line_number: 40,
    severity: "medium",
    category: "n_plus_one",
    agent_type: "quality",
    description: "Queries run in a loop.",
    suggestion: "Batch the lookups.",
  },
];

function Where() {
  const location = useLocation();
  return <div data-testid="where">{location.search}</div>;
}

function renderIssues(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/r1/issues${search}`]}>
      <Routes>
        <Route
          path="/dashboard/:id/issues"
          element={
            <>
              <Issues />
              <Where />
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.getAnalysisResults.mockResolvedValue({ id: "a1", issues: ISSUES });
});

describe("Issues", () => {
  it("opens the finding named in ?finding= on arrival", async () => {
    renderIssues(`?finding=${ISSUES[1].id}`);
    const panel = await screen.findByRole("complementary", { name: "Suggestions" });
    expect(within(panel).getByText("Batch the lookups.")).toBeInTheDocument();
  });

  it("opens suggestions from the button, and closing clears the URL", async () => {
    renderIssues();
    const buttons = await screen.findAllByRole("button", { name: "Suggestions for app/config.py line 12" });
    fireEvent.click(buttons[0]);
    const panel = screen.getByRole("complementary", { name: "Suggestions" });
    expect(within(panel).getByText("Read it from the environment.")).toBeInTheDocument();
    expect(screen.getByTestId("where").textContent).toContain(`finding=${ISSUES[0].id}`);

    fireEvent.click(screen.getByRole("button", { name: "Close suggestions" }));
    expect(screen.queryByRole("complementary", { name: "Suggestions" })).not.toBeInTheDocument();
    expect(screen.getByTestId("where").textContent).toBe("");
  });

  it("opens a finding from the keyboard", async () => {
    renderIssues();
    const rows = await screen.findAllByRole("row", { name: /app\/db\.py line 40/ });
    fireEvent.keyDown(rows[0], { key: "Enter" });
    expect(await screen.findByRole("complementary", { name: "Suggestions" })).toBeInTheDocument();
  });

  it("says so when the filters match nothing, and clears them", async () => {
    renderIssues();
    await screen.findAllByRole("row", { name: /app\/db\.py line 40/ });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search issues" }), {
      target: { value: "nothing like this" },
    });
    expect(screen.getByText("No findings match these filters")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.queryByText("No findings match these filters")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row", { name: /app\/config\.py line 12/ }).length).toBeGreaterThan(0);
  });
});
