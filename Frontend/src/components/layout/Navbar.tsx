import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Github, Menu, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import AccountDropdown from "@/components/layout/AccountDropdown";
import { useState, Fragment, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import apiClient from "@/lib/api";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
];

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const hash = location.hash || "";
  const isHomeActive = location.pathname === "/" && (hash === "" || hash === "#" || hash === "#home");
  const isFeaturesActive = (location.pathname === "/" && hash === "#features") || false;
  const isPricingActive = location.pathname === "/pricing" || (location.pathname === "/" && hash === "#pricing");
  const isDocsActive = location.pathname === "/docs" || (location.pathname === "/" && hash === "#docs");

  useEffect(() => {
    // Check auth on mount
    if (localStorage.getItem('token')) {
      apiClient.getCurrentUser().then(u => {
        // user data loaded by AccountDropdown
      }).catch(() => {
        // not logged in
      });
    }
  }, []);

  function handleDocsClick() {
    if (location.pathname === "/") {
      const el = document.getElementById("docs");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }

    navigate('/#docs');
  }

  function handleFeaturesClick() {
    if (location.pathname === "/") {
      const el = document.getElementById("features");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }

    // navigate to landing with hash; Landing will handle scrolling
    navigate('/#features');
  }

  function handleHomeClick() {
    if (location.pathname === "/") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    navigate('/');
  }

  function handlePricingClick() {
    if (location.pathname === "/") {
      const el = document.getElementById("pricing");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }

    navigate('/#pricing');
  }

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 z-50 glass-panel border-b"
    >
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to={isAuthenticated ? "/repos" : "/"} className="flex items-center gap-2 group">
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center shadow-lg group-hover:shadow-primary/25 transition-shadow">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary to-cyan-400 blur-lg opacity-30 group-hover:opacity-50 transition-opacity" />
          </div>
          <span className="font-bold text-xl">
            Repo<span className="gradient-text">IQ</span>
          </span>
        </Link>

        {/* Desktop Navigation: Home, Features, Pricing, Docs (explicit order) */}
        <div className="hidden md:flex items-center gap-1">
          <button
            onClick={handleHomeClick}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isHomeActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Home
          </button>

          <button
            onClick={handleFeaturesClick}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isFeaturesActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Features
          </button>

          <button
            onClick={handlePricingClick}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isPricingActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Pricing
          </button>

          <button
            onClick={handleDocsClick}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isDocsActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Docs
          </button>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          
          <div className="hidden sm:flex items-center gap-2">
            {/* Always show Login/Get Started on homepage (marketing page) */}
            {location.pathname === "/" ? (
              <>
                <Link to="/login">
                  <Button variant="outline">Login</Button>
                </Link>
                <Link to="/signup">
                  <Button variant="hero" className="gap-2">
                    <Github className="h-4 w-4" />
                    Get Started Free
                  </Button>
                </Link>
              </>
            ) : isAuthenticated ? (
              <>
                <Button variant="outline" onClick={handleLogout}>Logout</Button>
                <AccountDropdown />
              </>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="outline">Login</Button>
                </Link>
                <Link to="/signup">
                  <Button variant="hero" className="gap-2">
                    <Github className="h-4 w-4" />
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden glass-panel border-t"
        >
          <div className="container mx-auto px-4 py-4 flex flex-col gap-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleHomeClick();
              }}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isHomeActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
            >
              Home
            </button>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleFeaturesClick();
              }}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isFeaturesActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              Features
            </button>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handlePricingClick();
              }}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isPricingActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              Pricing
            </button>

            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleDocsClick();
              }}
              className={`px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isDocsActive ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              Docs
            </button>
            
            <div className="flex gap-2 mt-2 pt-2 border-t border-border">
              {/* Always show Login/Get Started on homepage (mobile) */}
              {location.pathname === "/" ? (
                <>
                  <Link to="/login" className="flex-1" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
                      Login
                    </Button>
                  </Link>
                  <Link to="/signup" className="flex-1" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="hero" className="w-full gap-2">
                      <Github className="h-4 w-4" />
                      Get Started Free
                    </Button>
                  </Link>
                </>
              ) : isAuthenticated ? (
                <>
                  <Button variant="outline" onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="flex-1">
                    Logout
                  </Button>
                  <div className="flex-1 flex justify-center">
                    <AccountDropdown />
                  </div>
                </>
              ) : (
                <>
                  <Link to="/login" className="flex-1" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full">
                      Login
                    </Button>
                  </Link>
                  <Link to="/signup" className="flex-1" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="hero" className="w-full gap-2">
                      <Github className="h-4 w-4" />
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </motion.header>
  );
}
