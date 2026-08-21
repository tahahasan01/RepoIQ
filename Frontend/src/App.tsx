import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/hooks/useTheme";
import { RoleProvider } from "@/hooks/useRole";
import { useEffect, Suspense, lazy } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { persistQueryCache, clearAllQueryCaches } from "@/lib/queryPersister";
import { usePrefetchOnLogin } from "@/hooks/usePrefetchOnLogin";

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

// Configure React Query for fast navigation WITHOUT stranding users on stale data.
//
// The previous config combined staleTime 10m, gcTime 60m, refetchOnMount false,
// refetchOnWindowFocus false, refetchOnReconnect false and refetchInterval false
// with a 24-hour localStorage restore. Nothing in that set ever triggers a
// refetch, so a user could be shown day-old scores with no path back to fresh
// data short of a hard reload.
//
// The fix keeps the instant-render behaviour - cached data still paints
// immediately - but lets a background revalidation follow it.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 minutes - render instantly, revalidate after
      gcTime: 60 * 60 * 1000, // 60 minutes - keep cache around for back-navigation
      refetchOnWindowFocus: false, // Too chatty for a dashboard with many panels
      refetchOnReconnect: true, // Coming back online should reconcile
      // 'always' still serves the cached value first; the request happens in the
      // background and the UI updates when it lands.
      refetchOnMount: 'always',
      retry: 2, // Retry failed requests twice
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Use cached data immediately while the background refetch is in flight
      placeholderData: (previousData) => previousData,
      refetchInterval: false, // Polling is opt-in per query (e.g. analysis status)
    },
    mutations: {
      retry: 1,
    },
  },
});

const AppInner = () => {
  // Prefetch critical data on login for instant loading
  usePrefetchOnLogin();

  // If API can't refresh (missing/expired refresh token), it will fire authExpired.
  // We force-route to /login and clear cache to avoid stale data.
  useEffect(() => {
    const handler = () => {
      try {
        // Clear every persisted bucket, not just the anonymous one. By the time
        // authExpired fires the token is usually already gone, so we cannot
        // derive the user's key - and leaving their data behind is the bug.
        clearAllQueryCaches();
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
          <Route path="/repos" element={<ProtectedRoute><Repositories /></ProtectedRoute>} />
          <Route path="/dashboard/:id" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/analyzing/:id" element={<ProtectedRoute><AnalyzeLoading /></ProtectedRoute>} />
          <Route path="/dashboard/:id/issues" element={<ProtectedRoute><Issues /></ProtectedRoute>} />
          <Route path="/dashboard/:id/files" element={<ProtectedRoute><Files /></ProtectedRoute>} />
          <Route path="/dashboard/:id/docs" element={<ProtectedRoute><Documentation /></ProtectedRoute>} />
          <Route path="/dashboard/:id/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><UserSettings /></ProtectedRoute>} />
          <Route path="/organizations" element={<ProtectedRoute><Organizations /></ProtectedRoute>} />
          <Route path="/organizations/:id" element={<ProtectedRoute><OrganizationDetail /></ProtectedRoute>} />
          <Route path="/teams" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
          <Route path="/teams/:id" element={<ProtectedRoute><TeamDetail /></ProtectedRoute>} />
          <Route path="/executive/:orgId" element={<ProtectedRoute><ExecutiveDashboard /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

const App = () => {
  // Initialize cache persistence
  useEffect(() => {
    // Get current user ID from localStorage token (if available)
    const getUserId = (): string | undefined => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          // Extract user ID from JWT token payload
          const payload = JSON.parse(atob(token.split('.')[1]));
          return payload?.sub || payload?.user_id || payload?.id;
        }
      } catch {}
      return undefined;
    };
    
    // Start persisting cache (will restore on mount)
    const userId = getUserId();
    const cleanup = persistQueryCache(queryClient, userId);
    
    // Re-initialize persistence when token changes (user logs in/out)
    const handleStorageChange = () => {
      const newUserId = getUserId();
      if (newUserId !== userId) {
        // User changed - reinitialize persistence
        cleanup();
        persistQueryCache(queryClient, newUserId);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      cleanup();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
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
};

export default App;
