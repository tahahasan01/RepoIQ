import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, isAuthenticated: true, login: vi.fn(), logout: vi.fn() }),
}));
// Both read server state; the header's own structure is what is under test.
vi.mock("@/components/NotificationBell", () => ({ default: () => <div data-testid="bell" /> }));
vi.mock("@/components/layout/AccountDropdown", () => ({ default: () => <div data-testid="account" /> }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => <div data-testid="theme" /> }));

import { AppHeader } from "@/components/layout/AppHeader";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppHeader />
    </MemoryRouter>
  );
}

describe("AppHeader", () => {
  it("marks the current section in the primary navigation", () => {
    renderAt("/teams/42");
    const nav = screen.getByRole("navigation", { name: "Main" });

    expect(within(nav).getByRole("link", { name: "Teams" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Repositories" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Organizations" })).not.toHaveAttribute("aria-current");
  });

  it("treats the executive dashboard as part of Organizations", () => {
    renderAt("/executive/7");
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Organizations" })).toHaveAttribute("aria-current", "page");
  });

  it("has no Logout button outside the account menu", () => {
    renderAt("/repos");
    expect(screen.queryByRole("button", { name: /log ?out|sign out/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("account")).toBeInTheDocument();
  });

  it("orders the utilities bell, theme, account", () => {
    renderAt("/repos");
    const [bell, theme, account] = ["bell", "theme", "account"].map((id) => screen.getByTestId(id));
    expect(bell.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(theme.compareDocumentPosition(account) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("starts with a skip link and names the phone menu toggle", () => {
    renderAt("/repos");
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveTextContent("Skip to content");
    const toggle = screen.getByRole("button", { name: "Open navigation menu" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: /^repo ?iq$/i })).toHaveAttribute("href", "/repos");
  });
});
