import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

vi.mock("@/components/layout/DashboardLayout", () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/hooks/useApiQueries", () => ({
  useRepositoryFiles: () => ({
    data: { files: [{ path: "src/app.ts" }, { path: "src/util.ts" }, { path: "docs/readme.md" }] },
    isLoading: false,
    error: null,
  }),
  useFileContent: () => ({ data: "line one\nline two", isLoading: false, isFetching: false, error: null }),
  useAnalysisResults: () => ({
    data: {
      issues: [{ file_path: "src/app.ts", line_number: 2, severity: "high", description: "Bad thing" }],
    },
  }),
  useAnalysisById: () => ({ data: undefined }),
}));

import Files from "@/pages/Files";

function renderFiles() {
  return render(
    <MemoryRouter initialEntries={["/dashboard/r1/files"]}>
      <Routes>
        <Route path="/dashboard/:id/files" element={<Files />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("Files", () => {
  it("tree items are buttons that open and close from the keyboard", () => {
    renderFiles();
    const docs = screen.getByRole("button", { name: "docs" });
    expect(docs).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(docs);
    expect(docs).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "readme.md" })).not.toBeInTheDocument();
    fireEvent.keyDown(docs, { key: "ArrowRight" });
    expect(screen.getByRole("button", { name: "readme.md" })).toBeInTheDocument();
  });

  it("can show only the files with findings", () => {
    renderFiles();
    expect(screen.getByRole("button", { name: "util.ts" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Only files with findings" }));
    expect(screen.queryByRole("button", { name: "util.ts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "docs" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "app.ts, 1 finding" })).toBeInTheDocument();
  });
});
