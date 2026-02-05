import { useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import apiClient from "@/lib/api";
import { Settings, LogOut, Building2, Users, BarChart3 } from "lucide-react";

export default function AccountDropdown() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const auth = useAuth();

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const handleToggle = () => {
    setOpen(!open);
  };

  const handleSettings = () => {
    setOpen(false);
    navigate("/settings");
  };

  const handleLogout = () => {
    setOpen(false);
    auth.logout();
    navigate("/");
  };

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const user = await apiClient.getCurrentUser();
        if (!mounted) return;
        if (user) {
          auth.login(user as any);
        }
      } catch (err) {
        // not logged in
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors"
        type="button"
      >
        <span className="hidden sm:inline-block text-sm font-medium">{auth.user?.name || auth.user?.full_name || auth.user?.github_username || "Account"}</span>
        <Avatar className="h-8 w-8">
          <AvatarImage src={auth.user?.avatar_url || auth.user?.avatar || "/placeholder.svg"} alt={auth.user?.name || auth.user?.full_name || "User"} />
          <AvatarFallback className="bg-primary text-primary-foreground">{(auth.user?.name || auth.user?.full_name || auth.user?.github_username || "U").slice(0,2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-background border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="p-3 border-b border-border flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={auth.user?.avatar_url || auth.user?.avatar || "/placeholder.svg"} alt={auth.user?.name || auth.user?.full_name || "User"} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {(auth.user?.name || auth.user?.full_name || auth.user?.github_username || "U").slice(0,2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{auth.user?.name || auth.user?.full_name || auth.user?.github_username || "Account"}</div>
              {auth.user?.email && (
                <div className="text-xs text-muted-foreground truncate">{auth.user.email}</div>
              )}
            </div>
          </div>
          <div className="p-2">
            <button
              onClick={() => {
                setOpen(false);
                navigate("/organizations");
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left"
            >
              <Building2 className="h-4 w-4" />
              Organizations
            </button>
            <button
              onClick={() => {
                setOpen(false);
                navigate("/teams");
              }}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left"
            >
              <Users className="h-4 w-4" />
              Teams
            </button>
            <button
              onClick={handleSettings}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left"
            >
              <Settings className="h-4 w-4" />
              Settings
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-accent transition-colors text-left text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
