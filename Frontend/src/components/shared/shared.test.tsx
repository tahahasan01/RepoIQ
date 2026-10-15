import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SeverityBadge } from "./SeverityBadge";
import { FilePath } from "./FilePath";
import { FindingRow, DESCRIPTION_CLAMP_CHARS, type FindingRowData } from "./FindingRow";
import { EmptyState } from "./EmptyState";
import { LoadingState, skeletonWidth } from "./LoadingState";
import { ScoreTrendChart } from "./ScoreTrendChart";
import { StatTile } from "./StatTile";

const finding: FindingRowData = {
  id: "f1",
  file: "app/api/config.py",
  line: 12,
  severity: "high",
  type: "hardcoded_secret",
  area: "security",
  description: "A secret key is committed to the repository.",
};

describe("SeverityBadge", () => {
  it("always shows the severity as a word", () => {
    render(<SeverityBadge severity="critical" />);
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("falls back to Low for an unknown severity", () => {
    render(<SeverityBadge severity="info" />);
    expect(screen.getByText("Low")).toBeInTheDocument();
  });
});

describe("FilePath", () => {
  it("shows the file name with its line, the folder below, and the full path as a tooltip", () => {
    render(<FilePath path="app/api/config.py" line={12} />);
    const name = screen.getByText("config.py:12");
    expect(screen.getByText("app/api")).toBeInTheDocument();
    expect(name.parentElement).toHaveAttribute("title", "app/api/config.py:12");
  });

  it("has no folder line for a file at the root", () => {
    const { container } = render(<FilePath path="README.md" />);
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(container.querySelectorAll(".font-mono")).toHaveLength(1);
  });
});

describe("FindingRow", () => {
  it("opens from the keyboard and labels area and type in words", () => {
    const onOpen = vi.fn();
    render(
      <ul>
        <FindingRow finding={finding} variant="card" onOpen={onOpen} />
      </ul>
    );
    const card = screen.getByRole("listitem");
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
  });

  it("does not open when a slot control is used", () => {
    const onOpen = vi.fn();
    render(
      <table>
        <tbody>
          <FindingRow
            finding={finding}
            variant="row"
            onOpen={onOpen}
            checkbox={<input type="checkbox" aria-label="Select" />}
            actions={<button type="button">Suggestions</button>}
          />
        </tbody>
      </table>
    );
    fireEvent.click(screen.getByLabelText("Select"));
    fireEvent.keyDown(screen.getByRole("button", { name: "Suggestions" }), { key: "Enter" });
    expect(onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("row"));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("clamps a long description behind a More toggle", () => {
    const long = "x".repeat(DESCRIPTION_CLAMP_CHARS + 20);
    const onOpen = vi.fn();
    render(
      <ul>
        <FindingRow finding={{ ...finding, description: long }} variant="card" onOpen={onOpen} />
      </ul>
    );
    const toggle = screen.getByRole("button", { name: "More" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Less" })).toHaveAttribute("aria-expanded", "true");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("links the compact summary to the finding", () => {
    render(
      <MemoryRouter>
        <FindingRow finding={finding} variant="compact" href="/dashboard/r1/issues?finding=f1" />
      </MemoryRouter>
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", "/dashboard/r1/issues?finding=f1");
  });
});

describe("EmptyState", () => {
  it("offers Retry in the error variant", () => {
    const onRetry = vi.fn();
    render(<EmptyState variant="error" title="Couldn't load" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe("LoadingState", () => {
  it("uses fixed skeleton widths and announces what is loading", () => {
    expect(skeletonWidth(0)).toBe(skeletonWidth(6));
    render(<LoadingState variant="lines" count={3} label="Loading files" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading files");
  });
});

describe("StatTile", () => {
  it("states a score's band in words", () => {
    render(<StatTile label="Security" score={55} />);
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("(Poor)", { exact: false })).toBeInTheDocument();
  });
});

describe("ScoreTrendChart", () => {
  it("shows a single point as the number, not a lone dot", () => {
    render(
      <ScoreTrendChart
        data={[{ date: "Oct 1", score: 72 }]}
        singlePointMessage={(p) => `First scan on ${p.date}.`}
        emptyMessage="No history"
      />
    );
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("First scan on Oct 1.")).toBeInTheDocument();
  });

  it("explains an empty history", () => {
    render(<ScoreTrendChart data={[]} singlePointMessage={() => ""} emptyMessage="No history yet" />);
    expect(screen.getByText("No history yet")).toBeInTheDocument();
  });
});
