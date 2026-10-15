import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PageHeader } from "./PageHeader";

function renderHeader() {
  return render(
    <MemoryRouter>
      <PageHeader
        breadcrumb={[
          { label: "Organizations", to: "/organizations" },
          { label: "Acme", to: "/organizations/org-1" },
          { label: "Platform" },
        ]}
        title="Platform"
        description="3 members"
        actions={<button type="button">Invite member</button>}
      />
    </MemoryRouter>,
  );
}

describe("PageHeader", () => {
  it("renders the breadcrumb as links up to the current page", () => {
    renderHeader();
    const nav = screen.getByRole("navigation", { name: /breadcrumb/i });

    expect(within(nav).getByRole("link", { name: "Organizations" })).toHaveAttribute("href", "/organizations");
    expect(within(nav).getByRole("link", { name: "Acme" })).toHaveAttribute("href", "/organizations/org-1");
    // The current page is marked, not linked.
    const current = within(nav).getByText("Platform");
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current.closest("a")).toBeNull();
    // Separators are plain slashes, hidden from screen readers.
    expect(nav.querySelectorAll('[aria-hidden="true"]')).toHaveLength(2);
  });

  it("renders one page title with its description and actions", () => {
    renderHeader();
    expect(screen.getByRole("heading", { level: 1, name: "Platform" })).toBeInTheDocument();
    expect(screen.getByText("3 members")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite member" })).toBeInTheDocument();
  });
});
