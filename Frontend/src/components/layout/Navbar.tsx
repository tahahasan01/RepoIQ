import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Github, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AppHeader, SkipLink } from "@/components/layout/AppHeader";
import { Logo } from "@/components/Logo";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const linkClass = (active: boolean, mobile = false) =>
  cn(
    "rounded-md text-sm font-medium transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    mobile ? "px-4 py-3" : "px-3 py-2",
    active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted",
  );

/**
 * The site header. Signed-in visitors get the app header (the same on the
 * landing and marketing pages as everywhere else); signed-out visitors get the
 * marketing links and sign-in actions.
 */
export function Navbar() {
  const { isAuthenticated } = useAuth();
  if (isAuthenticated) return <AppHeader position="fixed" />;
  return <PublicNavbar />;
}

function PublicNavbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const hash = location.hash || "";
  const onLanding = location.pathname === "/";

  /** Scroll to a landing-page section, or go to the landing page with its hash. */
  const goToSection = (id: "home" | "features" | "pricing" | "security") => {
    setMobileMenuOpen(false);
    if (onLanding) {
      if (id === "home") {
        window.scrollTo({ top: 0 });
        return;
      }
      const el = document.getElementById(id);
      if (el) {
        el.scrollIntoView();
        return;
      }
    }
    // Landing handles scrolling to the hash.
    navigate(id === "home" ? "/" : `/#${id}`);
  };

  const sections = [
    { id: "home" as const, label: "Home", active: onLanding && (hash === "" || hash === "#" || hash === "#home") },
    { id: "features" as const, label: "Features", active: onLanding && hash === "#features" },
    { id: "pricing" as const, label: "Pricing", active: location.pathname === "/pricing" || (onLanding && hash === "#pricing") },
    { id: "security" as const, label: "Security", active: onLanding && hash === "#security" },
  ];
  const docsActive = location.pathname === "/docs";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-b">
      <SkipLink />
      <nav aria-label="Main" className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Logo />
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goToSection(s.id)}
              aria-current={s.active ? "page" : undefined}
              className={linkClass(s.active)}
            >
              {s.label}
            </button>
          ))}
          <Link to="/docs" aria-current={docsActive ? "page" : undefined} className={linkClass(docsActive)}>
            Docs
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden sm:flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button variant="hero" className="gap-2" asChild>
              <Link to="/signup">
                <Github className="h-4 w-4" aria-hidden="true" />
                Get started
              </Link>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen((open) => !open)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
            aria-controls="public-mobile-menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </Button>
        </div>
      </nav>

      {mobileMenuOpen && (
        <div id="public-mobile-menu" className="md:hidden glass-panel border-t">
          <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => goToSection(s.id)}
                aria-current={s.active ? "page" : undefined}
                className={linkClass(s.active, true)}
              >
                {s.label}
              </button>
            ))}
            <Link
              to="/docs"
              onClick={() => setMobileMenuOpen(false)}
              aria-current={docsActive ? "page" : undefined}
              className={linkClass(docsActive, true)}
            >
              Docs
            </Link>
            <div className="flex gap-2 mt-2 pt-2 border-t border-border">
              <Button variant="outline" className="flex-1" asChild>
                <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                  Sign in
                </Link>
              </Button>
              <Button variant="hero" className="flex-1 gap-2" asChild>
                <Link to="/signup" onClick={() => setMobileMenuOpen(false)}>
                  <Github className="h-4 w-4" aria-hidden="true" />
                  Get started
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
