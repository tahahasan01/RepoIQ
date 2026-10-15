import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Github, Key, Loader2, Palette, Save, Shield, Upload, User } from "lucide-react";
import apiClient from "@/lib/api";
import { startGitHubFlow, type GitHubFlow } from "@/lib/githubAuth";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useToast } from "@/hooks/use-toast";
import { clearRepositoryCaches, queryKeys, useCurrentUser, useRepositories } from "@/hooks/useApiQueries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AppHeader, MAIN_CONTENT_ID } from "@/components/layout/AppHeader";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import { NotificationSettingsCard } from "@/components/settings/NotificationSettingsCard";
import { WebhooksCard } from "@/components/settings/WebhooksCard";

function SettingsSection({
  id,
  title,
  icon: Icon,
  danger = false,
  children,
}: {
  id: string;
  title: string;
  icon: typeof User;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className={`glass-panel rounded-xl p-6 scroll-mt-20 ${danger ? "border-destructive/30" : ""}`}
    >
      <div className="flex items-center gap-3 mb-6">
        <Icon className={`h-5 w-5 ${danger ? "text-destructive" : "text-primary"}`} aria-hidden="true" />
        <h2 id={`${id}-heading`} className={`text-xl font-semibold ${danger ? "text-destructive" : ""}`}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

/** A read-only value: a term and its text, not a disabled-looking input. */
function ReadOnlyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm break-words">{children}</dd>
    </div>
  );
}

/**
 * The account settings page - the only one. Profile, GitHub connection,
 * notifications, webhooks, appearance and account deletion.
 */
export default function UserSettings() {
  const { user: authUser, login } = useAuth();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();

  // GET /auth/me is the source of truth (created_at, github_connected,
  // has_password); the cached login user only fills the first paint.
  const { data: currentUser } = useCurrentUser();
  const user: AuthUser | null = currentUser ?? authUser;

  // Links such as /settings#webhooks land on that section. The router does
  // not scroll to a hash by itself.
  useEffect(() => {
    if (!location.hash) return;
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [location.hash]);

  /** Keep the cached /auth/me and the stored login user in step with a change. */
  const applyUserUpdate = (changes: Partial<AuthUser>) => {
    queryClient.setQueryData(queryKeys.currentUser, (old: AuthUser | undefined) => (old ? { ...old, ...changes } : old));
    if (authUser) login({ ...authUser, ...changes });
    queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });
  };

  // ---- Profile -----------------------------------------------------------

  // null = not edited, so the field shows the saved name and follows refetches.
  // (Seeding local state from the query and resetting it on every render is
  // what made the organization rename field undo each keystroke.)
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const savedName = user?.full_name || user?.name || "";
  const fullName = nameDraft ?? savedName;
  const nameChanged = nameDraft !== null && nameDraft.trim() !== savedName;
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const avatar = user?.avatar_url || user?.avatar || undefined;
  const initials = (fullName || user?.github_username || "U")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const handleSaveName = async () => {
    if (!nameChanged || nameDraft === null) return;
    setSavingName(true);
    try {
      // PUT /users/me accepts full_name, bio and avatar_url only.
      const updated = await apiClient.updateProfile({ full_name: nameDraft.trim() });
      applyUserUpdate({ full_name: updated?.full_name ?? nameDraft.trim() });
      setNameDraft(null);
      toast({ title: "Name saved" });
    } catch (error) {
      toast({
        title: "Couldn't save your name",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingName(false);
    }
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const result = await apiClient.uploadAvatar(file);
      applyUserUpdate({ avatar_url: result.avatar_url });
      toast({ title: "Avatar updated" });
    } catch (error) {
      toast({
        title: "Couldn't upload your avatar",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  // Password: only accounts that have a RepoIQ password (has_password true).
  // GitHub sign-in accounts have none, so PUT /users/me/password can't succeed.
  const hasPassword = currentUser?.has_password === true;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast({ title: "The new passwords don't match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "Use at least 8 characters", variant: "destructive" });
      return;
    }
    setSavingPassword(true);
    try {
      await apiClient.updatePassword(currentPassword, newPassword);
      toast({ title: "Password changed" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      toast({
        title: "Couldn't change your password",
        description: error instanceof Error ? error.message : undefined,
        variant: "destructive",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  // ---- GitHub connection ---------------------------------------------------

  // github_connected comes from /auth/me; until it loads, status isn't guessed.
  const githubKnown = typeof user?.github_connected === "boolean";
  const githubConnected = user?.github_connected === true;
  const githubUser = user?.github_username || user?.username || user?.login || null;
  const [githubBusy, setGithubBusy] = useState<GitHubFlow | "disconnect" | null>(null);

  const { data: repoList = [], isLoading: reposLoading } = useRepositories(1, 100, { enabled: githubConnected });
  const repoNames: string[] = githubConnected
    ? (repoList || []).map((r: { name?: string; full_name?: string }) => r.full_name || r.name || "").filter(Boolean)
    : [];

  /**
   * Connect or re-authorise GitHub, or open the GitHub App's install /
   * configure page to change which repositories RepoIQ can read. Both run in
   * this tab and return here.
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
    setGithubBusy("disconnect");
    try {
      await apiClient.disconnectGitHub();
      // Repository endpoints answer 403 from here on, so nothing cached about
      // repositories is still true.
      clearRepositoryCaches(queryClient);
      applyUserUpdate({ github_connected: false, github_username: null, avatar_url: null });
      toast({
        title: "GitHub disconnected",
        description: "To remove RepoIQ from GitHub entirely, uninstall the app in your GitHub settings.",
      });
    } catch (err) {
      console.error("[Settings] Disconnect failed", err);
      toast({
        title: "Couldn't disconnect GitHub",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setGithubBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />

      <main id={MAIN_CONTENT_ID} tabIndex={-1} className="container mx-auto px-4 py-8 max-w-4xl focus:outline-none">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-muted-foreground">Your profile, GitHub connection and account preferences.</p>
        </div>

        <div className="space-y-8">
          <SettingsSection id="profile" title="Profile" icon={User}>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="flex flex-col items-center gap-3">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={avatar} alt="" />
                  <AvatarFallback className="bg-primary text-primary-foreground text-2xl">{initials}</AvatarFallback>
                </Avatar>
                <div>
                  {/* The input stays in the tab order (sr-only, not hidden);
                      its label is styled as the button. */}
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    className="sr-only peer"
                    onChange={handleAvatarUpload}
                    disabled={uploadingAvatar}
                  />
                  <Label
                    htmlFor="avatar-upload"
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-md border border-input bg-background text-sm font-medium cursor-pointer hover:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Upload className="h-4 w-4" aria-hidden="true" />
                    )}
                    Change avatar
                  </Label>
                </div>
              </div>

              <div className="flex-1 min-w-0 w-full space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="settings-name">Name</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      id="settings-name"
                      value={fullName}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleSaveName();
                      }}
                      autoComplete="name"
                      className="sm:max-w-sm"
                    />
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={handleSaveName}
                      disabled={savingName || !nameChanged || !fullName.trim()}
                    >
                      {savingName ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Save className="h-4 w-4" aria-hidden="true" />
                      )}
                      Save name
                    </Button>
                  </div>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <ReadOnlyField label="Email">{user?.email || "Not available"}</ReadOnlyField>
                  <ReadOnlyField label="GitHub username">{githubUser ? `@${githubUser}` : "Not connected"}</ReadOnlyField>
                  <ReadOnlyField label="Member since">
                    {user?.created_at
                      ? new Date(user.created_at).toLocaleDateString(undefined, {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Unknown"}
                  </ReadOnlyField>
                </dl>
                <p className="text-xs text-muted-foreground">Your email comes from GitHub and can't be changed here.</p>

                {hasPassword && (
                  <fieldset className="space-y-4 pt-6 border-t border-border">
                    <legend className="flex items-center gap-2 font-medium">
                      <Key className="h-4 w-4 text-primary" aria-hidden="true" />
                      Password
                    </legend>
                    <div className="space-y-2">
                      <Label htmlFor="settings-current-password">Current password</Label>
                      <Input
                        id="settings-current-password"
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        autoComplete="current-password"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="settings-new-password">New password</Label>
                        <Input
                          id="settings-new-password"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          autoComplete="new-password"
                          aria-describedby="settings-password-help"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="settings-confirm-password">Confirm new password</Label>
                        <Input
                          id="settings-confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                    <p id="settings-password-help" className="text-xs text-muted-foreground">
                      At least 8 characters.
                    </p>
                    <Button
                      variant="outline"
                      onClick={handleChangePassword}
                      disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
                      className="gap-2"
                    >
                      {savingPassword && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                      Change password
                    </Button>
                  </fieldset>
                )}
              </div>
            </div>
          </SettingsSection>

          <SettingsSection id="github" title="GitHub connection" icon={Github}>
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-medium">
                    {!githubKnown
                      ? "Checking your GitHub connection…"
                      : githubConnected
                        ? githubUser
                          ? `Connected as @${githubUser}`
                          : "Connected"
                        : "Not connected"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {!githubConnected
                      ? "Connect GitHub to see and analyze your repositories."
                      : reposLoading
                        ? "Loading repositories…"
                        : `RepoIQ can read ${repoNames.length >= 100 ? "100 or more" : repoNames.length} ${
                            repoNames.length === 1 ? "repository" : "repositories"
                          }. Use "Manage repository access" to change which.`}
                  </p>
                </div>

                {githubKnown && (
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
                          {githubBusy === "install" ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          )}
                          Manage repository access
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => handleGitHubFlow("signin")}
                          disabled={githubBusy !== null}
                        >
                          {githubBusy === "signin" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                          Refresh access
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="gap-2 text-destructive hover:text-destructive" disabled={githubBusy !== null}>
                              {githubBusy === "disconnect" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                              Disconnect
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Disconnect GitHub?</AlertDialogTitle>
                              <AlertDialogDescription>
                                RepoIQ will lose access to your repositories until you reconnect. Your analyses are kept.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={handleDisconnectGitHub}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Disconnect GitHub
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    ) : (
                      <Button size="sm" className="gap-2" onClick={() => handleGitHubFlow("signin")} disabled={githubBusy !== null}>
                        {githubBusy === "signin" ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Github className="h-4 w-4" aria-hidden="true" />
                        )}
                        Connect GitHub
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {githubConnected && (
                <div>
                  <h3 id="readable-repos-heading" className="text-sm font-medium mb-2">
                    Repositories RepoIQ can read
                  </h3>
                  {repoNames.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{reposLoading ? "Loading…" : "None yet."}</p>
                  ) : (
                    <ul
                      aria-labelledby="readable-repos-heading"
                      className="max-h-48 overflow-auto rounded-lg border border-border divide-y divide-border"
                      tabIndex={0}
                    >
                      {repoNames.map((name) => (
                        <li key={name} className="px-3 py-2 text-sm font-mono truncate">
                          {name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </SettingsSection>

          {/* Notifications: persisted through /users/me/settings */}
          <div id="notifications" className="scroll-mt-20">
            <NotificationSettingsCard />
          </div>

          <div id="webhooks" className="scroll-mt-20">
            <WebhooksCard />
          </div>

          <SettingsSection id="appearance" title="Appearance" icon={Palette}>
            <fieldset>
              <legend className="text-sm font-medium mb-3">Theme</legend>
              <RadioGroup
                value={theme}
                onValueChange={(value) => setTheme(value as "light" | "dark")}
                className="flex flex-wrap gap-6"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="light" id="theme-light" />
                  <Label htmlFor="theme-light" className="font-normal">
                    Light
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="dark" id="theme-dark" />
                  <Label htmlFor="theme-dark" className="font-normal">
                    Dark
                  </Label>
                </div>
              </RadioGroup>
            </fieldset>
          </SettingsSection>

          <SettingsSection id="danger-zone" title="Danger zone" icon={Shield} danger>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-medium">Delete account</p>
                <p className="text-sm text-muted-foreground">
                  Permanently deletes your RepoIQ account and its data. This can't be undone.
                </p>
              </div>
              <DeleteAccountDialog size="sm" />
            </div>
          </SettingsSection>
        </div>
      </main>
    </div>
  );
}
