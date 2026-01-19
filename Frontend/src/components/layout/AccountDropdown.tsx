import { useState, useRef, useEffect } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Settings, LogOut } from "lucide-react";

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
    navigate("/login");
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors"
        type="button"
      >
        <span className="hidden sm:inline-block text-sm font-medium">John Doe</span>
        <Avatar className="h-8 w-8">
          <AvatarImage src="/placeholder.svg" alt="User" />
          <AvatarFallback className="bg-primary text-primary-foreground">JD</AvatarFallback>
        </Avatar>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 bg-background border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in-0 zoom-in-95">
          <div className="p-2">
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
