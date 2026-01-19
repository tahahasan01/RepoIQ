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
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { scanStorage } from "@/services/scanService";
import { useToast } from "@/hooks/use-toast";

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();

  const [notifications, setNotifications] = useState({
    email: true,
    security: true,
    weekly: false,
    slack: false,
  });

  const [avatar, setAvatar] = useState<string | null>(null);
  const [repos, setRepos] = useState<string[]>([]);
  const [enabledRepos, setEnabledRepos] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const scans = scanStorage.getScans();
    const repoNames = Array.from(new Set(scans.map((s) => s.repoName)));
    setRepos(repoNames);
    const initial: Record<string, boolean> = {};
    repoNames.forEach((r) => (initial[r] = true));
    setEnabledRepos(initial);
  }, []);

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
            <div className="w-20 h-20 rounded-full bg-muted/10 flex items-center justify-center overflow-hidden">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground">JD</div>
              )}
            </div>
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Name</label>
                  <Input defaultValue="John Doe" />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Email</label>
                  <Input defaultValue="john@example.com" type="email" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-2">
                  <Save className="h-4 w-4" /> Save Changes
                </Button>
                <Button variant="ghost" size="sm" className="gap-2">
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
              <p className="font-medium">Connected as @johndoe</p>
              <p className="text-sm text-muted-foreground">Access to 24 repositories</p>
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
                <Button variant="outline" size="sm">Refresh Access</Button>
                <Button variant="destructive" size="sm">Disconnect</Button>
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

        {/* Appearance removed per request */}

        {/* API Keys removed per request */}

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
              onClick={() => {
                if (confirm("Are you sure you want to delete your account? This cannot be undone.")) {
                  toast({ title: "Account deleted" });
                }
              }}
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
