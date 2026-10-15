import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Navbar } from "@/components/layout/Navbar";
import { MAIN_CONTENT_ID } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const NotFound = () => {
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className="container mx-auto px-4 pt-32 pb-16 max-w-xl focus:outline-none"
      >
        <p className="text-sm font-mono text-muted-foreground mb-2">404</p>
        <h1 className="text-3xl font-bold mb-3">This page doesn't exist.</h1>
        <p className="text-muted-foreground mb-8">
          The link may be out of date, or the address may have a typo. Check it, or{" "}
          <Link to="/docs" className="text-link underline underline-offset-4">
            read the docs
          </Link>
          .
        </p>
        <Button asChild>
          {isAuthenticated ? <Link to="/repos">Go to your repositories</Link> : <Link to="/">Go to the home page</Link>}
        </Button>
      </main>
    </div>
  );
};

export default NotFound;
