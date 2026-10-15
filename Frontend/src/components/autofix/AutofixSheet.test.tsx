import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { AutofixRun } from "@/types/assistant";

const api = vi.hoisted(() => ({
  getAutofixRun: vi.fn(),
  listAutofixRuns: vi.fn(async () => []),
  approveAutofixRun: vi.fn(),
  discardAutofixRun: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ default: api, apiClient: api }));

import { AutofixSheet } from "@/components/autofix/AutofixSheet";

const ISSUE = "3f2b8c1e-9a4d-4e6b-8f1a-2c3d4e5f6a7b";

const readyRun: AutofixRun = {
  id: "run-1",
  repository_id: "repo-1",
  status: "ready",
  issue_ids: [ISSUE],
  proposals: [
    {
      file_path: "src/db.py",
      summary: "Use a parameterised query",
      diff: "@@ -1,1 +1,1 @@\n-cur.execute(f\"... {x}\")\n+cur.execute(\"... %s\", (x,))\n",
      issue_ids: [ISSUE],
    },
  ],
  skipped: [{ file_path: "src/big.py", reason: "The change touched too many lines" }],
  created_at: new Date().toISOString(),
};

function renderSheet() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AutofixSheet
          repoId="repo-1"
          open
          onOpenChange={() => {}}
          activeRunId="run-1"
          onSelectRun={() => {}}
          issueLabels={{ [ISSUE]: "SQL injection (src/db.py:1)" }}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("AutofixSheet", () => {
  it("shows a ready run's diff and opens the pull request on approval", async () => {
    api.getAutofixRun.mockResolvedValueOnce(readyRun).mockResolvedValue({ ...readyRun, status: "publishing" });
    api.approveAutofixRun.mockResolvedValue({ status: "publishing" });
    renderSheet();

    expect(await screen.findByText("Use a parameterised query")).toBeInTheDocument();
    expect(screen.getAllByText("SQL injection (src/db.py:1)").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Proposed changes to src/db.py" })).toBeInTheDocument();
    expect(screen.getByText("Added:")).toBeInTheDocument();
    expect(screen.getByText(/too many lines/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open pull request/i }));
    await waitFor(() => expect(api.approveAutofixRun).toHaveBeenCalledWith("run-1"));
    expect(await screen.findByText("Opening a draft pull request")).toBeInTheDocument();
  });

  it("shows the draft pull request and what it addresses when completed", async () => {
    api.getAutofixRun.mockResolvedValue({
      ...readyRun,
      status: "completed",
      pr_url: "https://github.com/acme/app/pull/42",
      pr_number: 42,
      branch: "repoiq/fix-abc",
      fixed_issue_ids: [ISSUE],
    });
    renderSheet();

    const link = await screen.findByRole("link", { name: /view draft pull request #42/i });
    expect(link).toHaveAttribute("href", "https://github.com/acme/app/pull/42");
    expect(screen.getByText(/marked fixed after the next analysis/)).toBeInTheDocument();
  });

  it("shows a failure message verbatim", async () => {
    api.getAutofixRun.mockResolvedValue({
      ...readyRun,
      status: "failed",
      error_message: 'The RepoIQ GitHub App needs "Contents: Read and write" permission.',
    });
    renderSheet();
    expect(
      await screen.findByText('The RepoIQ GitHub App needs "Contents: Read and write" permission.')
    ).toBeInTheDocument();
  });
});
