import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const auth = vi.hoisted(() => ({ isAuthenticated: false }));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, isAuthenticated: auth.isAuthenticated, login: vi.fn(), logout: vi.fn() }),
}));
// Both read server state; the header's own branching is what is under test.
vi.mock("@/components/NotificationBell", () => ({ default: () => <div data-testid="bell" /> }));
vi.mock("@/components/layout/AccountDropdown", () => ({ default: () => <div data-testid="account" /> }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));

import { Navbar } from "@/components/layout/Navbar";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Navbar />
    </MemoryRouter>
  );
}

describe("Navbar", () => {
  beforeEach(() => {
    auth.isAuthenticated = false;
  });

  it("shows the signed-in header on the landing page", () => {
    // The landing page used to force Login / Get Started Free on everyone.
    auth.isAuthenticated = true;
    renderAt("/");

    expect(screen.getByTestId("account")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Repositories" })).toHaveAttribute("href", "/repos");
    expect(screen.queryByRole("button", { name: "Login" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Get Started/)).not.toBeInTheDocument();
  });

  it("shows the same signed-in header on other pages", () => {
    auth.isAuthenticated = true;
    renderAt("/pricing");

    expect(screen.getByTestId("account")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Login" })).not.toBeInTheDocument();
  });

  it("offers sign-in to signed-out visitors", () => {
    renderAt("/");

    expect(screen.getByRole("button", { name: "Login" })).toBeInTheDocument();
    expect(screen.queryByTestId("account")).not.toBeInTheDocument();
  });
});
