import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Building2,
  Users,
  FolderGit2,
  Settings,
  ArrowLeft,
  Loader2,
  Plus,
  BarChart3,
  TrendingUp,
  Shield,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Edit2,
  Trash2,
  Crown,
  Zap,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import apiClient from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/layout/Navbar";

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [repositories, setRepositories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (id) {
      loadData();
    }
  }, [id]);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [org, orgTeams, orgRepos] = await Promise.all([
        apiClient.getOrganization(id),
        apiClient.listOrganizationTeams(id),
        apiClient.getOrganizationRepositories(id),
      ]);
      setOrganization(org);
      setTeams(orgTeams);
      setRepositories(orgRepos);
      setNewName(org.name);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load organization data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateName = async () => {
    if (!id || !newName.trim()) return;
    try {
      setSaving(true);
      await apiClient.updateOrganization(id, newName);
      setOrganization({ ...organization, name: newName });
      setEditingName(false);
      toast({
        title: "Success",
        description: "Organization name updated",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update organization",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      setDeleting(true);
      await apiClient.deleteOrganization(id);
      toast({
        title: "Success",
        description: "Organization deleted",
      });
      navigate("/organizations");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete organization",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[80vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 pt-24">
          <Card>
            <CardContent className="py-16 text-center">
              <p className="text-muted-foreground">Organization not found</p>
              <Link to="/organizations">
                <Button variant="outline" className="mt-4">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Organizations
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const planColors: Record<string, string> = {
    free: "bg-slate-500",
    pro: "bg-blue-500",
    enterprise: "bg-purple-500",
  };

  const planIcons: Record<string, any> = {
    free: Zap,
    pro: Crown,
    enterprise: Shield,
  };

  const PlanIcon = planIcons[organization.plan_type] || Zap;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-7xl pt-24">
        {/* Header Section */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/organizations">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-cyan-400 flex items-center justify-center shadow-lg">
                  <Building2 className="h-8 w-8 text-white" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-background flex items-center justify-center border-2 border-background">
                  <Badge className={`${planColors[organization.plan_type]} text-white text-[10px] px-1.5 py-0`}>
                    {organization.plan_type}
                  </Badge>
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-bold">{organization.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  <PlanIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground capitalize">{organization.plan_type} Plan</span>
                  <span className="text-muted-foreground">•</span>
                  <span className="text-muted-foreground text-sm">
                    Created {new Date(organization.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <Link to={`/executive/${id}`}>
            <Button className="gap-2 bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90">
              <BarChart3 className="h-4 w-4" />
              Executive Dashboard
            </Button>
          </Link>
        </div>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-background">
              Overview
            </TabsTrigger>
            <TabsTrigger value="teams" className="data-[state=active]:bg-background">
              Teams ({teams.length})
            </TabsTrigger>
            <TabsTrigger value="repositories" className="data-[state=active]:bg-background">
              Repositories ({repositories.length})
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-background">
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-500/10 to-blue-600/5">
                <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -mr-10 -mt-10" />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Teams
                  </CardTitle>
                  <div className="p-2 bg-blue-500/20 rounded-lg">
                    <Users className="h-4 w-4 text-blue-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{teams.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">Active teams</p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-green-500/10 to-green-600/5">
                <div className="absolute top-0 right-0 w-20 h-20 bg-green-500/10 rounded-full -mr-10 -mt-10" />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Repositories
                  </CardTitle>
                  <div className="p-2 bg-green-500/20 rounded-lg">
                    <FolderGit2 className="h-4 w-4 text-green-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{repositories.length}</div>
                  <p className="text-xs text-muted-foreground mt-1">Assigned repos</p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-purple-500/10 to-purple-600/5">
                <div className="absolute top-0 right-0 w-20 h-20 bg-purple-500/10 rounded-full -mr-10 -mt-10" />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Health Score
                  </CardTitle>
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <Activity className="h-4 w-4 text-purple-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">--</div>
                  <p className="text-xs text-muted-foreground mt-1">Analyze repos to see</p>
                </CardContent>
              </Card>

              <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-orange-500/10 to-orange-600/5">
                <div className="absolute top-0 right-0 w-20 h-20 bg-orange-500/10 rounded-full -mr-10 -mt-10" />
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Plan
                  </CardTitle>
                  <div className="p-2 bg-orange-500/20 rounded-lg">
                    <PlanIcon className="h-4 w-4 text-orange-500" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold capitalize">{organization.plan_type}</div>
                  <p className="text-xs text-muted-foreground mt-1">Current plan</p>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
                <CardDescription>Common tasks for managing your organization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Link to={`/teams?org=${id}`} className="block">
                    <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-primary/5 hover:border-primary/50">
                      <Plus className="h-5 w-5 text-primary" />
                      <span>Create Team</span>
                      <span className="text-xs text-muted-foreground">Add a new team</span>
                    </Button>
                  </Link>
                  <Link to="/repos" className="block">
                    <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-green-500/5 hover:border-green-500/50">
                      <FolderGit2 className="h-5 w-5 text-green-500" />
                      <span>Assign Repository</span>
                      <span className="text-xs text-muted-foreground">Link repos to teams</span>
                    </Button>
                  </Link>
                  <Link to={`/executive/${id}`} className="block">
                    <Button variant="outline" className="w-full h-auto py-4 flex flex-col items-center gap-2 hover:bg-purple-500/5 hover:border-purple-500/50">
                      <BarChart3 className="h-5 w-5 text-purple-500" />
                      <span>View Dashboard</span>
                      <span className="text-xs text-muted-foreground">Executive metrics</span>
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Recent Teams */}
            {teams.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Teams</CardTitle>
                    <CardDescription>Your organization's teams</CardDescription>
                  </div>
                  <Link to={`/teams?org=${id}`}>
                    <Button variant="ghost" size="sm">
                      View All <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {teams.slice(0, 3).map((team) => (
                      <Link key={team.id} to={`/teams/${team.id}`}>
                        <div className="p-4 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg">
                              <Users className="h-4 w-4 text-primary" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{team.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {team.description || "No description"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Teams Tab */}
          <TabsContent value="teams" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-semibold">Teams</h2>
                <p className="text-muted-foreground">Manage your organization's teams</p>
              </div>
              <Link to={`/teams?org=${id}`}>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create Team
                </Button>
              </Link>
            </div>
            {teams.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
                  <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
                    Create teams to organize developers and track their code quality metrics.
                  </p>
                  <Link to={`/teams?org=${id}`}>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Your First Team
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.map((team) => (
                  <Card key={team.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Users className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg">{team.name}</CardTitle>
                          {team.description && (
                            <CardDescription className="line-clamp-2">{team.description}</CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Link to={`/teams/${team.id}`}>
                        <Button variant="outline" className="w-full">
                          View Team
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Repositories Tab */}
          <TabsContent value="repositories" className="space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-semibold">Repositories</h2>
                <p className="text-muted-foreground">Repositories assigned to this organization</p>
              </div>
            </div>
            {repositories.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <FolderGit2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No repositories assigned</h3>
                  <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
                    Assign repositories to teams to start tracking code quality.
                  </p>
                  <Link to="/repos">
                    <Button>
                      <FolderGit2 className="h-4 w-4 mr-2" />
                      Go to Repositories
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {repositories.map((repo) => (
                  <Card key={repo.id} className="hover:shadow-md transition-shadow">
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-green-500/10 rounded-lg">
                          <FolderGit2 className="h-5 w-5 text-green-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg">{repo.name}</CardTitle>
                          <CardDescription>{repo.full_name}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Link to={`/dashboard/${repo.id}`}>
                        <Button variant="outline" className="w-full">
                          View Dashboard
                        </Button>
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold">Settings</h2>
              <p className="text-muted-foreground">Manage your organization settings</p>
            </div>

            {/* General Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  General Settings
                </CardTitle>
                <CardDescription>Basic organization information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Organization Name</Label>
                  <div className="flex items-center gap-2">
                    {editingName ? (
                      <>
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="max-w-xs"
                        />
                        <Button onClick={handleUpdateName} disabled={saving} size="sm">
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                        </Button>
                        <Button variant="ghost" onClick={() => {
                          setEditingName(false);
                          setNewName(organization.name);
                        }} size="sm">
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-lg">{organization.name}</span>
                        <Button variant="ghost" size="icon" onClick={() => setEditingName(true)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Created</Label>
                  <p className="text-muted-foreground">
                    {new Date(organization.created_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Plan & Billing */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Crown className="h-5 w-5" />
                  Plan & Billing
                </CardTitle>
                <CardDescription>Your current subscription plan</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${planColors[organization.plan_type]}`}>
                      <PlanIcon className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <p className="font-semibold capitalize text-lg">{organization.plan_type} Plan</p>
                      <p className="text-sm text-muted-foreground">
                        {organization.plan_type === "free" && "Basic features for small teams"}
                        {organization.plan_type === "pro" && "Advanced features for growing teams"}
                        {organization.plan_type === "enterprise" && "Full features for large organizations"}
                      </p>
                    </div>
                  </div>
                  {organization.plan_type !== "enterprise" && (
                    <Button variant="outline">
                      Upgrade Plan
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Links */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Links</CardTitle>
                <CardDescription>Navigate to related pages</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Link to={`/teams?org=${id}`}>
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <Users className="h-4 w-4" />
                      Manage Teams
                    </Button>
                  </Link>
                  <Link to={`/executive/${id}`}>
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Executive Dashboard
                    </Button>
                  </Link>
                  <Link to="/repos">
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <FolderGit2 className="h-4 w-4" />
                      All Repositories
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
                <CardDescription>Irreversible actions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 border border-destructive/30 rounded-lg bg-destructive/5">
                  <div>
                    <p className="font-medium">Delete Organization</p>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete this organization and all its data
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the
                          organization <strong>"{organization.name}"</strong> and all associated
                          teams and settings.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={deleting}
                        >
                          {deleting ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                          )}
                          Delete Organization
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
