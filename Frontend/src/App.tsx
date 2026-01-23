import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/hooks/useTheme";
import { RoleProvider } from "@/hooks/useRole";
import { useEffect } from "react";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import GitHubCallback from "./pages/GitHubCallback";
import Repositories from "./pages/Repositories";
import Dashboard from "./pages/Dashboard";
import AnalyzeLoading from "./pages/AnalyzeLoading";
import Issues from "./pages/Issues";
import Files from "./pages/Files";
import Documentation from "./pages/Documentation";
import Pricing from "./pages/Pricing";
import Docs from "./pages/Docs";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

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
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/signup" element={<SignUp />} />
        <Route path="/auth/github/callback" element={<GitHubCallback />} />
        <Route path="/docs" element={<Docs />} />
        <Route path="/repos" element={<Repositories />} />
        <Route path="/dashboard/:id" element={<Dashboard />} />
        <Route path="/analyzing/:id" element={<AnalyzeLoading />} />
        <Route path="/dashboard/:id/issues" element={<Issues />} />
        <Route path="/dashboard/:id/files" element={<Files />} />
        <Route path="/dashboard/:id/docs" element={<Documentation />} />
        <Route path="/dashboard/:id/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {/* Chatbot removed */}
    </BrowserRouter>
  );
};

const App = () => (
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
);

export default App;
