import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/hooks/useTheme";
import { RoleProvider } from "@/hooks/useRole";
import { useEffect, Suspense, lazy } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Eager load critical pages (landing, login)
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import GitHubCallback from "./pages/GitHubCallback";

// Lazy load non-critical pages for better initial bundle size
const SignUp = lazy(() => import("./pages/SignUp"));
const Repositories = lazy(() => import("./pages/Repositories"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const AnalyzeLoading = lazy(() => import("./pages/AnalyzeLoading"));
const Issues = lazy(() => import("./pages/Issues"));
const Files = lazy(() => import("./pages/Files"));
const Documentation = lazy(() => import("./pages/Documentation"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Docs = lazy(() => import("./pages/Docs"));
const Settings = lazy(() => import("./pages/Settings"));
const UserSettings = lazy(() => import("./pages/UserSettings"));
const Organizations = lazy(() => import("./pages/Organizations"));
const OrganizationDetail = lazy(() => import("./pages/OrganizationDetail"));
const Teams = lazy(() => import("./pages/Teams"));
const TeamDetail = lazy(() => import("./pages/TeamDetail"));
const ExecutiveDashboard = lazy(() => import("./pages/ExecutiveDashboard"));
const Features = lazy(() => import("./pages/Features"));
const Changelog = lazy(() => import("./pages/Changelog"));
const About = lazy(() => import("./pages/About"));
const Blog = lazy(() => import("./pages/Blog"));
const Careers = lazy(() => import("./pages/Careers"));
const Contact = lazy(() => import("./pages/Contact"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Security = lazy(() => import("./pages/Security"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-4">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-muted-foreground text-sm">Loading...</p>
    </div>
  </div>
);

// Configure React Query with optimized settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data considered fresh
      gcTime: 30 * 60 * 1000, // 30 minutes - cache garbage collection (formerly cacheTime)
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnReconnect: true, // Refetch on reconnect
      retry: 2, // Retry failed requests twice
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      retry: 1,
    },
  },
});

const AppInner = () => {
  // If API can't refresh (missing/expired refresh token), it will fire authExpired.
  // We force-route to /login to avoid the UI silently showing "0 runs / 0 stats".
  useEffect(() => {
    const handler = () => {
      try {
        if (window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
      } catch {}
    };
    window.addEventListener("authExpired", handler as EventListener);
    return () => window.removeEventListener("authExpired", handler as EventListener);
  }, []);

  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Eager loaded routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/auth/github/callback" element={<GitHubCallback />} />
          
          {/* Lazy loaded routes */}
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/features" element={<Features />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="/about" element={<About />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/careers" element={<Careers />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/security" element={<Security />} />
          <Route path="/repos" element={<Repositories />} />
          <Route path="/dashboard/:id" element={<Dashboard />} />
          <Route path="/analyzing/:id" element={<AnalyzeLoading />} />
          <Route path="/dashboard/:id/issues" element={<Issues />} />
          <Route path="/dashboard/:id/files" element={<Files />} />
          <Route path="/dashboard/:id/docs" element={<Documentation />} />
          <Route path="/dashboard/:id/settings" element={<Settings />} />
          <Route path="/settings" element={<UserSettings />} />
          <Route path="/organizations" element={<Organizations />} />
          <Route path="/organizations/:id" element={<OrganizationDetail />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:id" element={<TeamDetail />} />
          <Route path="/executive/:orgId" element={<ExecutiveDashboard />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RoleProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <AppInner />
          </TooltipProvider>
        </RoleProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
