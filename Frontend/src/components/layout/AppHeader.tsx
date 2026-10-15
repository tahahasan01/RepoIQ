import { useState, type MouseEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/ThemeToggle";
import NotificationBell from "@/components/NotificationBell";
import AccountDropdown from "@/components/layout/AccountDropdown";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/** Pages give their main region this id; `<main>` is the fallback. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * Moves focus to the page's main region. Pages rendered through Navbar don't
 * all have an id'd `<main>`, so this falls back to the first `<main>`, then to
 * whatever follows the header.
 */
function focusMainContent(event: MouseEvent<HTMLAnchorElement>) {
  const header = event.currentTarget.closest("header");
  const target =
    document.getElementById(MAIN_CONTENT_ID) ??
    document.querySelector<HTMLElement>("main") ??
    (header?.nextElementSibling as HTMLElement | null);
  if (!target) return;
  event.preventDefault();
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus();
  target.scrollIntoView({ block: "start" });
}

/** First focusable element on the page; visible only while focused. */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={focusMainContent}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring"
    >
      Skip to content
    </a>
  );
}

const PRIMARY_NAV = [
  { to: "/repos", label: "Repositories", match: ["/repos", "/dashboard", "/analyzing"] },
  // The executive dashboard belongs to an organization.
  { to: "/organizations", label: "Organizations", match: ["/organizations", "/executive"] },
  { to: "/teams", label: "Teams", match: ["/teams"] },
] as const;

function isActive(pathname: string, match: readonly string[]) {
  return match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

interface AppHeaderProps {
  /**
   * "fixed" for pages that already pad their content for a fixed header (the
   * ones rendered through Navbar); "sticky" otherwise.
   */
  position?: "sticky" | "fixed";
}

/**
 * The header for every signed-in page outside the repository workspace:
 * logo, primary navigation, then notifications, theme and the account menu.
 */
export function AppHeader({ position = "sticky" }: AppHeaderProps) {
  const { pathname } = useLocation();
  const { isAuthenticated } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = PRIMARY_NAV.map((item) => ({ ...item, active: isActive(pathname, item.match) }));

  return (
    <header
      className={cn(
        "z-50 glass-panel border-b",
        position === "fixed" ? "fixed top-0 left-0 right-0" : "sticky top-0",
      )}
    >
      <SkipLink />
      <div className="container mx-auto px-4 h-16 flex items-center gap-2 sm:gap-4">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden -ml-2 shrink-0" aria-label="Open navigation menu">
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <div className="h-16 flex items-center px-4 border-b">
              <SheetTitle asChild>
                <span>
                  <Logo size="sm" />
                </span>
              </SheetTitle>
            </div>
            <SheetDescription className="sr-only">Main navigation</SheetDescription>
            <nav aria-label="Main" className="p-3 flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={item.active ? "page" : undefined}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                    focusRing,
                    item.active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <Link to={isAuthenticated ? "/repos" : "/"} className={cn("shrink-0 rounded-md", focusRing)}>
          <Logo />
        </Link>

        <nav aria-label="Main" className="hidden md:flex items-center gap-1 ml-4">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                focusRing,
                item.active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <NotificationBell />
          <ThemeToggle />
          <AccountDropdown />
        </div>
      </div>
    </header>
  );
}

export default AppHeader;
