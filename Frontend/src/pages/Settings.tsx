import { motion } from "framer-motion";
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  User,
  Github,
  Bell,
  Shield,
  Key,
  Save,
  LogOut,
  Upload,
  Loader2,
  ExternalLink,
} from "lucide-react";
import apiClient from "@/lib/api";
import { startGitHubFlow, type GitHubFlow } from "@/lib/githubAuth";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { clearRepositoryCaches, queryKeys, useCurrentUser, useRepositories } from "@/hooks/useApiQueries";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";

export default function Settings() {
  const { toast } = useToast();
  const { user: authUser, login, logout } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();

  // GET /auth/me is the source of truth; the cached login user only fills the
  // first paint.
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const user: AuthUser | null = currentUser ?? authUser;

  const githubConnected = Boolean(user?.github_connected ?? user?.github_username);
  const githubUser = user?.github_username || user?.username || user?.login || null;

  const { data: repoList = [], isLoading: reposLoading } = useRepositories(1, 100, {
    enabled: githubConnected,
  });
  const repoNames: string[] = githubConnected
    ? (repoList || []).map((r: { name?: string; full_name?: string }) => r.full_name || r.name || "")
    : [];

  // null = not edited, so the field shows the saved name and follows refetches.
  // (Seeding local state from the query and resetting it on every render is
  // what made the organization rename field undo each keystroke.)
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const savedName = user?.full_name || user?.name || "";
  const fullName = nameDraft ?? savedName;
  const nameChanged = nameDraft !== null && nameDraft.trim() !== savedName;

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [githubBusy, setGithubBusy] = useState<GitHubFlow | "disconnect" | null>(null);

  const avatar = user?.avatar_url || user?.avatar || null;
  // Only an explicit false means "no password" - an older backend, or a failed
  // lookup, leaves it unset and the form stays available.
  const hasNoPassword = currentUser?.has_password === false;

  /** Keep the cached /auth/me and the stored login user in step with a change. */
  const applyUserUpdate = (changes: Partial<AuthUser>) => {
    queryClient.setQueryData(queryKeys.currentUser, (old: AuthUser | undefined) =>
      old ? { ...old, ...changes } : old
    );
    if (authUser) login({ ...authUser, ...changes });
    queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });
  };

  const handleSaveProfile = async () => {
    if (!nameChanged || nameDraft === null) return;
    try {
      setIsSaving(true);
      // PUT /users/me accepts full_name, bio and avatar_url only; email is not
      // editable and used to be sent and silently ignored.
      const updated = await apiClient.updateProfile({ full_name: nameDraft.trim() });
      applyUserUpdate({ full_name: updated?.full_name ?? nameDraft.trim() });
      setNameDraft(null);
      toast({ title: "Name updated" });
    } catch (error) {
      toast({
        title: "Failed to update profile",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    try {
      setIsSaving(true);
      await apiClient.updatePassword(currentPassword, newPassword);
      toast({ title: "Password changed successfully" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast({
        title: "Failed to change password",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await apiClient.uploadAvatar(file);
      applyUserUpdate({ avatar_url: result.avatar_url });
      toast({ title: "Avatar updated successfully" });
    } catch (error) {
      toast({ title: "Failed to upload avatar", variant: "destructive" });
    }
  };

  const handleSignOut = () => {
    void logout();
  };

  /**
   * Re-authorise (or connect) GitHub, or open the GitHub App's install /
   * configure page to change which repositories RepoIQ can read. Both run in
   * this tab and return here. "Refresh Access" used to open GitHub in a new
   * tab, whose callback then hit an early return for signed-in users and threw
   * the code away.
   */
  const handleGitHubFlow = async (flow: GitHubFlow) => {
    setGithubBusy(flow);
    try {
      await startGitHubFlow(flow, { returnTo: location.pathname + location.search });
    } catch (err) {
      setGithubBusy(null);
      toast({
        title: "Couldn't start GitHub",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDisconnectGitHub = async () => {
    if (!confirm("Disconnect GitHub from your account? RepoIQ will lose access to your repositories until you reconnect.")) return;
    setGithubBusy("disconnect");
    try {
      await apiClient.disconnectGitHub();
      // Repository endpoints answer 403 from here on, so nothing cached about
      // repositories is still true. The page used to re-fetch the list and keep
      // showing it, alongside the old avatar and username.
      clearRepositoryCaches(queryClient);
      applyUserUpdate({ github_connected: false, github_username: null, avatar_url: null });
      toast({
        title: "GitHub disconnected",
        description: "To remove RepoIQ from GitHub entirely, uninstall the app in your GitHub settings.",
      });
    } catch (err) {
      console.error("[Settings] Disconnect failed", err);
      toast({
        title: "Failed to disconnect GitHub",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setGithubBusy(null);
    }
  };

  const isLoading = userLoading && !user;

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">
            {isLoading ? "Loading account information..." : "Manage your account and preferences"}
          </p>
        </motion.div>

        {/* Profile */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <User className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Profile</h2>
          </div>
          <div className="flex items-start gap-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-muted/10 flex items-center justify-center overflow-hidden">
                {avatar ? (
                  <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    {fullName.trim().length > 0
                      ? fullName.split(" ").filter(Boolean).map((n) => n[0]).join("").toUpperCase()
                      : "U"}
                  </div>
                )}
              </div>
              <label className="absolute bottom-0 right-0 bg-primary rounded-full p-1.5 cursor-pointer hover:bg-primary/80">
                <Upload className="h-3 w-3 text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </label>
            </div>
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="settings-name" className="text-sm font-medium mb-2 block">Name</label>
                  <Input
                    id="settings-name"
                    value={fullName}
                    onChange={(e) => setNameDraft(e.target.value)}
                  />
                </div>
                <div>
                  <span className="text-sm font-medium mb-2 block">Email</span>
                  <p className="h-10 px-3 flex items-center rounded-md border border-input bg-muted/30 text-sm text-muted-foreground truncate">
                    {user?.email || "Not available"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Comes from your GitHub account and can't be changed here.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleSaveProfile}
                  disabled={isSaving || !nameChanged || !fullName.trim()}
                >
                  <Save className="h-4 w-4" /> {isSaving ? "Saving..." : "Save Changes"}
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" onClick={handleSignOut}>
                  <LogOut className="h-4 w-4" /> Sign out
                </Button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* GitHub Connection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-panel rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Github className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">GitHub Connection</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="font-medium">
                {githubConnected ? (githubUser ? `Connected as @${githubUser}` : "Connected") : "Not connected"}
              </p>
              <p className="text-sm text-muted-foreground">
                {!githubConnected
                  ? "Connect GitHub to see and analyze your repositories."
                  : reposLoading
                    ? "Loading repositories..."
                    : `Access to ${repoNames.length >= 100 ? "100+" : repoNames.length} repositories`}
              </p>
              {githubConnected && (
                <p className="text-xs text-muted-foreground mt-2">
                  Use "Manage repository access" to choose which repositories RepoIQ can read.
                </p>
              )}
            </div>
            <div className="flex flex-col md:items-end justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {githubConnected ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => handleGitHubFlow("install")}
                      disabled={githubBusy !== null}
                    >
                      {githubBusy === "install" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                      Manage repository access
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGitHubFlow("signin")}
                      disabled={githubBusy !== null}
                    >
                      {githubBusy === "signin" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Refresh Access
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDisconnectGitHub}
                      disabled={githubBusy !== null}
                    >
                      {githubBusy === "disconnect" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={() => handleGitHubFlow("signin")}
                    disabled={githubBusy !== null || isLoading}
                  >
                    {githubBusy === "signin" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
                    Connect GitHub
                  </Button>
                )}
              </div>
              {githubConnected && (
                <div className="w-full">
                  <h4 className="text-sm font-medium mb-2">Repositories RepoIQ can read</h4>
                  <div className="max-h-40 overflow-auto space-y-2">
                    {repoNames.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        {reposLoading ? "Loading..." : "No repositories connected"}
                      </div>
                    ) : (
                      repoNames.map((r) => (
                        <div key={r} className="text-sm bg-muted/10 p-2 rounded truncate">
                          {r}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* Notifications and webhooks are account-wide and live on /settings;
            this page used to show switches here that saved nothing. */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Notifications and webhooks</h2>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground max-w-xl">
              Notification preferences and webhooks apply to your whole account, not just this repository. Manage
              them in account settings.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/settings#notifications">Notification settings</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/settings#webhooks">Webhooks</Link>
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Security */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-panel rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Key className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Security</h2>
          </div>
          {hasNoPassword ? (
            // GitHub sign-in accounts have no RepoIQ password, so PUT
            // /users/me/password can never succeed for them.
            <p className="text-sm text-muted-foreground">
              You sign in with GitHub, so your account has no RepoIQ password to change. Manage
              your sign-in security (password, two-factor authentication) in your GitHub account
              settings.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <label htmlFor="settings-current-password" className="text-sm font-medium mb-2 block">Current Password</label>
                <Input
                  id="settings-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="settings-new-password" className="text-sm font-medium mb-2 block">New Password</label>
                  <Input
                    id="settings-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label htmlFor="settings-confirm-password" className="text-sm font-medium mb-2 block">Confirm Password</label>
                  <Input
                    id="settings-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleChangePassword}
                disabled={isSaving || !currentPassword || !newPassword || !confirmPassword}
              >
                <Key className="h-4 w-4 mr-2" /> Change Password
              </Button>
            </div>
          )}
        </motion.div>

        {/* Danger Zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-panel rounded-xl p-6 border-destructive/20"
        >
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Delete Account</p>
              <p className="text-sm text-muted-foreground">Permanently delete your account and all data</p>
            </div>
            <DeleteAccountDialog size="sm" />
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
