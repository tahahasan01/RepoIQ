import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/hooks/useTheme";
import { RoleProvider } from "@/hooks/useRole";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import SignUp from "./pages/SignUp";
import Repositories from "./pages/Repositories";
import Dashboard from "./pages/Dashboard";
import Issues from "./pages/Issues";
import Files from "./pages/Files";
import Documentation from "./pages/Documentation";
import Pricing from "./pages/Pricing";
import Docs from "./pages/Docs";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <RoleProvider>
        <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/repos" element={<Repositories />} />
            <Route path="/dashboard/:id" element={<Dashboard />} />
            <Route path="/dashboard/:id/issues" element={<Issues />} />
            <Route path="/dashboard/:id/files" element={<Files />} />
            <Route path="/dashboard/:id/docs" element={<Documentation />} />
            <Route path="/dashboard/:id/settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          {/* Chatbot removed */}
        </BrowserRouter>
        </TooltipProvider>
      </RoleProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
