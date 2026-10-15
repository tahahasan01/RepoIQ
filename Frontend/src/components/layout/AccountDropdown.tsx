import { useEffect } from "react";
import { Link } from "react-router-dom";
import { HelpCircle, LogOut, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useCurrentUser } from "@/hooks/useApiQueries";

/**
 * The account menu: Settings, Help and Sign out. Organizations and Teams are
 * in the header's primary navigation. Built on the Radix dropdown, so Escape,
 * arrow keys, focus return and aria-expanded come with it.
 */
export default function AccountDropdown() {
  const auth = useAuth();

  // The shared, token-gated query. This used to call /auth/me directly on
  // every mount - including signed out, where it drew a 403 and then a doomed
  // token refresh on the login page itself.
  const { data: currentUser } = useCurrentUser();
  useEffect(() => {
    if (currentUser) auth.login(currentUser);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const name = auth.user?.name || auth.user?.full_name || auth.user?.github_username || "Account";
  const initials = (auth.user?.name || auth.user?.full_name || auth.user?.github_username || "U").slice(0, 2).toUpperCase();
  const avatarSrc = auth.user?.avatar_url || auth.user?.avatar || undefined;

  const handleSignOut = () => {
    // Revokes the session server-side, then reloads into the landing page.
    void auth.logout({ redirectTo: "/" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={`Account menu for ${name}`}
      >
        <span className="hidden xl:inline-block text-sm font-medium whitespace-nowrap max-w-[10rem] truncate" aria-hidden="true">
          {name}
        </span>
        <Avatar className="h-8 w-8">
          <AvatarImage src={avatarSrc} alt="" />
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">{initials}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium truncate">{name}</div>
          {auth.user?.email && <div className="text-xs text-muted-foreground truncate">{auth.user.email}</div>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/settings" className="gap-2 cursor-pointer">
            <Settings className="h-4 w-4" aria-hidden="true" />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/docs" className="gap-2 cursor-pointer">
            <HelpCircle className="h-4 w-4" aria-hidden="true" />
            Help
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleSignOut} className="gap-2 cursor-pointer">
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
