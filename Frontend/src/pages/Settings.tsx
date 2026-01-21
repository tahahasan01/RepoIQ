import { motion } from "framer-motion";
import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  User,
  Github,
  Bell,
  Shield,
  Palette,
  Key,
  Trash2,
  Save,
  LogOut,
  Copy,
  Upload,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { scanStorage } from "@/services/scanService";
import apiClient from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState({
    email: true,
    security: true,
    weekly: false,
    slack: false,
  });

  const [avatar, setAvatar] = useState<string | null>(null);
  const [repos, setRepos] = useState<string[]>([]);
  const [enabledRepos, setEnabledRepos] = useState<Record<string, boolean>>({});
  const [githubUser, setGithubUser] = useState<string | null>(null);
  const [repoCount, setRepoCount] = useState<number>(0);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const user = await apiClient.getCurrentUser().catch(() => null);
        if (!mounted) return;
        if (user) {
          setAvatar(user.avatar || user.avatar_url || null);
          setFullName(user.full_name || user.name || "");
          setEmail(user.email || "");
          setGithubUser(user.github_username || user.username || user.login || null);
        }

        const repoList = await apiClient.getRepositories(1, 100).catch(() => []);
        if (!mounted) return;
        const repoNames = (repoList || []).map((r: any) => r.name || r.full_name);
        setRepos(repoNames);
        setRepoCount(repoNames.length || 0);
        const initial: Record<string, boolean> = {};
        repoNames.forEach((r: any) => (initial[r] = true));
        setEnabledRepos(initial);
      } catch (err) {
        const scans = scanStorage.getScans();
        const repoNames = Array.from(new Set(scans.map((s) => s.repoName)));
        setRepos(repoNames);
        setRepoCount(repoNames.length || 0);
        const initial: Record<string, boolean> = {};
        repoNames.forEach((r) => (initial[r] = true));
        setEnabledRepos(initial);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleSaveProfile = async () => {
    try {
      setIsSaving(true);
      await apiClient.updateProfile({ full_name: fullName, email });
      toast({ title: "Profile updated successfully" });
    } catch (error) {
      toast({ title: "Failed to update profile", variant: "destructive" });
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
      toast({ title: "Failed to change password", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    try {
      const result = await apiClient.uploadAvatar(file);
      setAvatar(result.avatar_url);
      toast({ title: "Avatar updated successfully" });
    } catch (error) {
      toast({ title: "Failed to upload avatar", variant: "destructive" });
    }
  };

  const handleSignOut = async () => {
    try {
      await apiClient.logout();
    } catch (error) {
      // Continue with logout even if API call fails
    }
    logout();
    navigate("/login");
  };

  const handleRefreshAccess = async () => {
    try {
      const res = await apiClient.getGitHubAuthUrl();
      const url = res?.auth_url;
      if (url) {
        // Open GitHub OAuth in a new window/tab
        window.open(url, '_blank');
      } else {
        toast({ title: 'Failed to get GitHub auth URL', variant: 'destructive' });
      }
    } catch (err) {
      console.error('[Settings] Refresh access failed', err);
      toast({ title: 'Failed to refresh access', variant: 'destructive' });
    }
  };

  const handleDisconnectGitHub = async () => {
    if (!confirm('Disconnect GitHub from your account?')) return;
    try {
      await apiClient.disconnectGitHub();
      toast({ title: 'GitHub disconnected' });
      // Refresh local user and repos
      const user = await apiClient.getCurrentUser().catch(() => null);
      if (user) {
        setAvatar(user.avatar || user.avatar_url || null);
        setFullName(user.full_name || user.name || '');
        setEmail(user.email || '');
        setGithubUser(user.github_username || user.username || user.login || null);
      }
      const repoList = await apiClient.getRepositories(1, 100).catch(() => []);
      const repoNames = (repoList || []).map((r: any) => r.name || r.full_name);
      setRepos(repoNames);
      setRepoCount(repoNames.length || 0);
      const initial: Record<string, boolean> = {};
      repoNames.forEach((r: any) => (initial[r] = true));
      setEnabledRepos(initial);
    } catch (err) {
      console.error('[Settings] Disconnect failed', err);
      toast({ title: 'Failed to disconnect GitHub', variant: 'destructive' });
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm("Are you sure you want to delete your account? This action cannot be undone.")) {
      return;
    }
    try {
      await apiClient.deleteAccount();
      toast({ title: "Account deleted" });
      logout();
      navigate("/login");
    } catch (error) {
      toast({ title: "Failed to delete account", variant: "destructive" });
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h1 className="text-2xl font-bold mb-2">Settings</h1>
              <p className="text-muted-foreground">Manage your account and preferences</p>
            </motion.div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => toast({ title: "Changes discarded" })}>Cancel</Button>
            <Button onClick={() => toast({ title: "Settings saved" })} className="gap-2">
              <Save className="h-4 w-4" /> Save All
            </Button>
          </div>
        </div>
        {/* top heading shown once above */}

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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    {(fullName && fullName.trim().length > 0)
                      ? fullName.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase()
                      : 'U'}
                  </div>
                )}
              </div>
              <label className="absolute bottom-0 right-0 bg-primary rounded-full p-1.5 cursor-pointer hover:bg-primary/80">
                <Upload className="h-3 w-3 text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              </label>
            </div>
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Name</label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Email</label>
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2" 
                  onClick={handleSaveProfile}
                  disabled={isSaving}
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-medium">{githubUser ? `Connected as @${githubUser}` : 'Not connected'}</p>
              <p className="text-sm text-muted-foreground">Access to {repoCount} repositories</p>
              <div className="text-sm text-muted-foreground mt-2">Auto-sync settings:</div>
              <div className="flex items-center gap-3 mt-2">
                <Switch checked={true} />
                <div>
                  <div className="font-medium">Auto scan new repos</div>
                  <div className="text-xs text-muted-foreground">When enabled, newly added repos will be scanned automatically</div>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-end justify-between">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleRefreshAccess}>Refresh Access</Button>
                <Button variant="destructive" size="sm" onClick={handleDisconnectGitHub}>Disconnect</Button>
              </div>
              <div className="w-full mt-2">
                <h4 className="text-sm font-medium mb-2">Repository access</h4>
                <div className="max-h-40 overflow-auto space-y-2">
                  {/* repo toggles (sample) */}
                  {repos.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No repositories connected</div>
                  ) : (
                    repos.map((r) => (
                      <div key={r} className="flex items-center justify-between bg-muted/10 p-2 rounded">
                        <div className="text-sm">{r}</div>
                        <Checkbox checked={!!enabledRepos[r]} onCheckedChange={(c) => setEnabledRepos({ ...enabledRepos, [r]: !!c })} />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Notifications */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel rounded-xl p-6"
        >
          <div className="flex items-center gap-3 mb-6">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Notifications</h2>
          </div>
          <div className="space-y-4">
            {[
              { key: "email", label: "Email notifications", desc: "Receive scan results via email" },
              { key: "security", label: "Security alerts", desc: "Get notified about critical vulnerabilities" },
              { key: "weekly", label: "Weekly digest", desc: "Summary of all repository activity" },
              { key: "slack", label: "Slack alerts", desc: "Send critical alerts to Slack" },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
                <Switch
                  checked={notifications[item.key as keyof typeof notifications]}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, [item.key]: checked })
                  }
                />
              </div>
            ))}

            <div className="pt-2 border-t border-border mt-2">
              <label className="text-sm font-medium">Alert threshold</label>
              <div className="mt-2 flex gap-2">
                <button className="px-3 py-1 rounded border">critical</button>
                <button className="px-3 py-1 rounded border">high</button>
                <button className="px-3 py-1 rounded border">medium</button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Danger Zone */}
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
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Current Password</label>
              <Input 
                type="password" 
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">New Password</label>
                <Input 
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Confirm Password</label>
                <Input 
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
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
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Delete Account</p>
              <p className="text-sm text-muted-foreground">Permanently delete your account and all data</p>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteAccount}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete Account
            </Button>
          </div>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}

// load repos when module renders
// small effect to populate sample repo list
 (function bootstrapRepos() {
  // noop — actual loading happens in component mount
 })();
