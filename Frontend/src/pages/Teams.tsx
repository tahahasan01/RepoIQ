import { useState, useEffect } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Plus, Users, Building2, ArrowRight, Loader2, UserPlus, Info, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import apiClient from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/layout/Navbar";

// Cache keys
const TEAMS_CACHE_KEY = "repoiq_teams_cache";
const ORGS_CACHE_KEY = "repoiq_orgs_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default function Teams() {
  const [searchParams] = useSearchParams();
  const orgId = searchParams.get("org");
  const [teams, setTeams] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamOrgId, setNewTeamOrgId] = useState(orgId || "");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Load from cache first for instant display
  useEffect(() => {
    const cachedOrgs = sessionStorage.getItem(ORGS_CACHE_KEY);
    const cachedTeams = sessionStorage.getItem(TEAMS_CACHE_KEY);
    
    if (cachedOrgs) {
      try {
        const { data, timestamp } = JSON.parse(cachedOrgs);
        if (Date.now() - timestamp < CACHE_TTL) {
          setOrganizations(data);
        }
      } catch {}
    }
    
    if (cachedTeams && !orgId) {
      try {
        const { data, timestamp } = JSON.parse(cachedTeams);
        if (Date.now() - timestamp < CACHE_TTL) {
          setTeams(data);
          setLoading(false);
        }
      } catch {}
    }
    
    loadData();
  }, [orgId]);

  const loadData = async () => {
    try {
      // Only show loading if no cached data
      if (teams.length === 0) {
        setLoading(true);
      }
      
      const orgs = await apiClient.listOrganizations();
      setOrganizations(orgs);
      sessionStorage.setItem(ORGS_CACHE_KEY, JSON.stringify({ data: orgs, timestamp: Date.now() }));
      
      if (orgId) {
        const orgTeams = await apiClient.listOrganizationTeams(orgId);
        setTeams(orgTeams);
      } else {
        // Load teams from all organizations IN PARALLEL for faster loading
        const teamsArrays = await Promise.all(
          orgs.map(org => 
            apiClient.listOrganizationTeams(org.id).catch(() => [])
          )
        );
        const allTeams = teamsArrays.flat();
        setTeams(allTeams);
        sessionStorage.setItem(TEAMS_CACHE_KEY, JSON.stringify({ data: allTeams, timestamp: Date.now() }));
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load teams",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    try {
      setDeletingTeamId(teamId);
      await apiClient.deleteTeam(teamId);
      setTeams(teams.filter(t => t.id !== teamId));
      // Update cache
      const updatedTeams = teams.filter(t => t.id !== teamId);
      sessionStorage.setItem(TEAMS_CACHE_KEY, JSON.stringify({ data: updatedTeams, timestamp: Date.now() }));
      toast({
        title: "Success",
        description: "Team deleted successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete team",
        variant: "destructive",
      });
    } finally {
      setDeletingTeamId(null);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) {
      toast({
        title: "Error",
        description: "Team name is required",
        variant: "destructive",
      });
      return;
    }

    if (!newTeamOrgId) {
      if (organizations.length === 0) {
        toast({
          title: "No Organizations",
          description: "You need to create an organization first before creating a team.",
          variant: "destructive",
        });
        setCreateDialogOpen(false);
        setTimeout(() => navigate("/organizations"), 500);
      } else {
        toast({
          title: "Error",
          description: "Please select an organization",
          variant: "destructive",
        });
      }
      return;
    }

    try {
      setCreating(true);
      const team = await apiClient.createTeam(
        newTeamOrgId,
        newTeamName,
        undefined,
        newTeamDescription || undefined
      );
      setTeams([...teams, team]);
      setCreateDialogOpen(false);
      setNewTeamName("");
      setNewTeamDescription("");
      toast({
        title: "Success",
        description: "Team created successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create team",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-7xl pt-24">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">Teams</h1>
            <p className="text-muted-foreground mt-2">
              Create teams of developers and assign repositories to them. Compare team performance, track code quality trends, and identify which teams need support.
            </p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Team
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Team</DialogTitle>
                <DialogDescription>
                  Create a new team in an organization
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="org">Organization</Label>
                  {organizations.length === 0 ? (
                    <div className="space-y-2">
                      <Select disabled>
                        <SelectTrigger>
                          <SelectValue placeholder="No organizations available" />
                        </SelectTrigger>
                      </Select>
                      <p className="text-sm text-muted-foreground">
                        You need to create an organization first.{" "}
                        <Link to="/organizations" className="text-primary hover:underline" onClick={() => setCreateDialogOpen(false)}>
                          Create Organization
                        </Link>
                      </p>
                    </div>
                  ) : (
                    <Select value={newTeamOrgId} onValueChange={setNewTeamOrgId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Team Name</Label>
                  <Input
                    id="name"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Development Team"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    value={newTeamDescription}
                    onChange={(e) => setNewTeamDescription(e.target.value)}
                    placeholder="Team description..."
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateTeam} disabled={creating || organizations.length === 0}>
                  {creating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {teams.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Users className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No teams yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first team to get started
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Team
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teams.map((team) => {
              const org = organizations.find((o) => o.id === team.organization_id);
              return (
                <Card key={team.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{team.name}</CardTitle>
                          {org && (
                            <CardDescription className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {org.name}
                            </CardDescription>
                          )}
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="text-muted-foreground hover:text-destructive"
                            disabled={deletingTeamId === team.id}
                          >
                            {deletingTeamId === team.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Team</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete <strong>"{team.name}"</strong>? 
                              This will remove all team members and repository assignments. 
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDeleteTeam(team.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Delete Team
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {team.description && (
                      <p className="text-sm text-muted-foreground mb-4">
                        {team.description}
                      </p>
                    )}
                    <Link to={`/teams/${team.id}`}>
                      <Button variant="outline" className="w-full">
                        View Team
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Concept Explanation Card - Moved below teams list */}
        <Card className="mt-8 bg-muted/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">What are Teams?</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <strong>Teams</strong> are groups of developers working together. They help you:
            </p>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside ml-2">
              <li>Track which developers work together on repositories</li>
              <li>Compare code quality between different teams</li>
              <li>Identify which teams introduce more issues or fix more bugs</li>
              <li>Assign repositories to specific teams for ownership tracking</li>
              <li>Monitor team performance trends over time</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">
              <strong>Example:</strong> Assign your React app to "Frontend Team" and your API to "Backend Team". 
              Then you can see at a glance: "Frontend Team has 3 critical issues, Backend Team has 12" - 
              helping you prioritize where to focus your attention.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
