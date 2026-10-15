import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { useCurrentUser } from "@/hooks/useApiQueries";
import { useToast } from "@/hooks/use-toast";
import { startGitHubFlow } from "@/lib/githubAuth";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import AccountDropdown from "@/components/layout/AccountDropdown";
import NotificationBell from "@/components/NotificationBell";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import { NotificationSettingsCard } from "@/components/settings/NotificationSettingsCard";
import { WebhooksCard } from "@/components/settings/WebhooksCard";
import {
  Zap,
  User,
  Bell,
  Shield,
  ChevronLeft,
  Github,
  Mail,
  Calendar,
  Loader2,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function UserSettings() {
  const auth = useAuth();
  const location = useLocation();
  const { toast } = useToast();
  // /auth/me carries fields the cached login user does not (created_at,
  // github_connected).
  const { data: currentUser } = useCurrentUser();
  const user: AuthUser | null = currentUser ?? auth.user;

  // The badge used to say "Connected" unconditionally. github_connected comes
  // from /auth/me; until that loads the badge is not shown rather than guessed.
  const githubKnown = typeof user?.github_connected === "boolean";
  const githubConnected = user?.github_connected === true;
  const [connecting, setConnecting] = useState(false);

  // Links such as /settings#webhooks land on that section. The router does
  // not scroll to a hash by itself.
  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  const handleConnectGitHub = async () => {
    setConnecting(true);
    try {
      await startGitHubFlow("signin", { returnTo: location.pathname });
    } catch (err) {
      setConnecting(false);
      toast({
        title: "Couldn't start GitHub",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass-panel border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-xl">
              Repo<span className="gradient-text">IQ</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <NotificationBell />
            <ThemeToggle />
            <AccountDropdown />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back button */}
        <Link to="/repos" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Back to Repositories
        </Link>

        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold mb-2">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your account preferences and profile information.
          </p>
        </motion.div>

        {/* Settings sections */}
        <div className="space-y-8">
          {/* Profile Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <User className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Profile</h2>
            </div>

            <div className="flex items-start gap-6">
              <Avatar className="h-20 w-20">
                <AvatarImage 
                  src={user?.avatar_url || user?.avatar || "/placeholder.svg"} 
                  alt={user?.name || "User"} 
                />
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                  {(user?.name || user?.github_username || "U").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      Name
                    </label>
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{user?.name || user?.full_name || user?.github_username || "Not set"}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      Email
                    </label>
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{user?.email || "Not available"}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      GitHub Username
                    </label>
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <Github className="h-4 w-4 text-muted-foreground" />
                      <span>{user?.github_username || user?.login || "Not connected"}</span>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-muted-foreground mb-1 block">
                      Member Since
                    </label>
                    <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {user?.created_at 
                          ? new Date(user.created_at).toLocaleDateString('en-US', { 
                              month: 'long', 
                              day: 'numeric', 
                              year: 'numeric' 
                            })
                          : "Unknown"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>

          {/* Connected Accounts Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-panel rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Connected Accounts</h2>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#24292e] flex items-center justify-center">
                    <Github className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium">GitHub</p>
                    <p className="text-sm text-muted-foreground">
                      {githubConnected
                        ? user?.github_username || user?.login || "Connected"
                        : "Connect GitHub to see and analyze your repositories"}
                    </p>
                  </div>
                </div>
                {githubKnown && (
                  <div className="flex items-center gap-3">
                    {githubConnected ? (
                      <span className="text-sm px-3 py-1 rounded-full bg-green-500/10 text-green-500">
                        Connected
                      </span>
                    ) : (
                      <>
                        <span className="text-sm px-3 py-1 rounded-full bg-muted text-muted-foreground">
                          Not connected
                        </span>
                        <Button size="sm" className="gap-2" onClick={handleConnectGitHub} disabled={connecting}>
                          {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                          Connect GitHub
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.section>

          {/* Preferences Section */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-panel rounded-xl p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <Bell className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">Preferences</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="font-medium">Theme</p>
                  <p className="text-sm text-muted-foreground">
                    Switch between light and dark mode
                  </p>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </motion.section>

          {/* Notifications: persisted through /users/me/settings */}
          <motion.div
            id="notifications"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
          >
            <NotificationSettingsCard />
          </motion.div>

          {/* Webhooks */}
          <motion.div
            id="webhooks"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <WebhooksCard />
          </motion.div>

          {/* Danger Zone */}
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="glass-panel rounded-xl p-6 border-destructive/20"
          >
            <h2 className="text-xl font-semibold text-destructive mb-4">Danger Zone</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Once you delete your account, there is no going back. Please be certain.
            </p>
            {/* This button used to say "Log Out" and only cleared local tokens. */}
            <DeleteAccountDialog />
          </motion.section>
        </div>
      </main>
    </div>
  );
}
