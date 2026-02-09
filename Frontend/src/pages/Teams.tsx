import { useState } from "react";
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
import { useTeams, useOrganizations, usePrefetchTeam, queryKeys } from "@/hooks/useApiQueries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function Teams() {
  const [searchParams] = useSearchParams();
  const orgId = searchParams.get("org");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const prefetchTeam = usePrefetchTeam();
  
  // Use React Query for instant loading with cached data
  const { data: organizations = [], isLoading: orgsLoading, refetch: refetchOrgs } = useOrganizations({
    placeholderData: (previousData) => previousData,
    refetchOnMount: true, // Always refetch on mount to get latest data
  });
  // Only call useTeams if orgId is valid (not null/undefined/empty string)
  const validOrgId = orgId && orgId !== 'undefined' && orgId !== 'null' ? orgId : undefined;
  const { data: teams = [], isLoading: teamsLoading, refetch: refetchTeams } = useTeams(validOrgId, {
    placeholderData: (previousData) => previousData,
    refetchOnMount: true, // Always refetch on mount to get latest data
    enabled: true, // Always enabled - useTeams handles undefined internally
  });
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamOrgId, setNewTeamOrgId] = useState(orgId || "");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  
  // Show loading only if we have no cached data
  const loading = (orgsLoading && organizations.length === 0) || (teamsLoading && teams.length === 0);

  const createTeamMutation = useMutation({
    mutationFn: ({ name, orgId, description }: { name: string; orgId: string; description?: string }) =>
      apiClient.createTeam(orgId, name, undefined, description),
    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.teams() });
      await queryClient.cancelQueries({ queryKey: queryKeys.teams(orgId || undefined) });
    },
    onSuccess: (newTeam) => {
      console.log('[Teams] ✅ Created team:', newTeam);
      
      // Optimistically add new team to cache
      queryClient.setQueryData(queryKeys.teams(), (old: any[] = []) => {
        if (old.some((team: any) => team.id === newTeam.id)) {
          console.log('[Teams] ⚠️ Team already in cache, skipping add');
          return old;
        }
        console.log('[Teams] ➕ Adding new team to cache:', newTeam.name);
        return [...old, newTeam];
      });
      
      if (orgId) {
        queryClient.setQueryData(queryKeys.teams(orgId), (old: any[] = []) => {
          if (old.some((team: any) => team.id === newTeam.id)) {
            return old;
          }
          return [...old, newTeam];
        });
      }
      
      setCreateDialogOpen(false);
      setNewTeamName("");
      setNewTeamDescription("");
      setNewTeamOrgId(orgId || "");
      toast({
        title: "Success",
        description: "Team created successfully",
      });
      
      // Force refetch to ensure we have latest data from backend
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.teams() });
        queryClient.invalidateQueries({ queryKey: queryKeys.teams(orgId || undefined) });
        refetchTeams();
      }, 100);
    },
    onError: (error: any) => {
      console.error('[Teams] ❌ Failed to create team:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create team",
        variant: "destructive",
      });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      console.log('[Teams] 🗑️ Deleting team:', teamId);
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Delete request timed out')), 10000)
      );
      const deletePromise = apiClient.deleteTeam(teamId);
      return Promise.race([deletePromise, timeoutPromise]) as Promise<void>;
    },
    onMutate: async (teamId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.teams() });
      await queryClient.cancelQueries({ queryKey: queryKeys.teams(orgId || undefined) });
      
      // Snapshot previous values
      const previousTeamsAll = queryClient.getQueryData(queryKeys.teams());
      const previousTeamsOrg = queryClient.getQueryData(queryKeys.teams(orgId || undefined));
      
      console.log('[Teams] 📸 Snapshot before delete. All teams:', previousTeamsAll?.length, 'Org teams:', previousTeamsOrg?.length);
      
      // Optimistically remove team from cache
      queryClient.setQueryData(queryKeys.teams(), (old: any[] = []) => {
        const filtered = old.filter((team: any) => team.id !== teamId);
        console.log('[Teams] ➖ Removed team from all teams cache. Before:', old.length, 'After:', filtered.length);
        return filtered;
      });
      queryClient.setQueryData(queryKeys.teams(orgId || undefined), (old: any[] = []) => {
        const filtered = old.filter((team: any) => team.id !== teamId);
        console.log('[Teams] ➖ Removed team from org teams cache. Before:', old.length, 'After:', filtered.length);
        return filtered;
      });
      
      return { previousTeamsAll, previousTeamsOrg };
    },
    onError: (error: any, teamId, context) => {
      console.error('[Teams] ❌ Delete failed:', error, 'teamId:', teamId);
      
      const isTimeout = error?.message?.includes('timeout');
      const is404 = error?.message?.includes('404') || error?.status === 404;
      
      // Rollback on error (unless timeout or 404)
      if (!isTimeout && !is404) {
        if (context?.previousTeamsAll) {
          console.log('[Teams] 🔄 Rolling back cache');
          queryClient.setQueryData(queryKeys.teams(), context.previousTeamsAll);
        }
        if (context?.previousTeamsOrg) {
          queryClient.setQueryData(queryKeys.teams(orgId || undefined), context.previousTeamsOrg);
        }
      }
      
      // If 404 or timeout, the team might already be deleted - remove it from cache anyway
      if (is404 || isTimeout) {
        console.log('[Teams] ⚠️', isTimeout ? 'Timeout' : '404', '- removing from cache anyway');
        queryClient.setQueryData(queryKeys.teams(), (old: any[] = []) => 
          old.filter((team: any) => team.id !== teamId)
        );
        queryClient.setQueryData(queryKeys.teams(orgId || undefined), (old: any[] = []) => 
          old.filter((team: any) => team.id !== teamId)
        );
        toast({
          title: isTimeout ? "Timeout" : "Success",
          description: isTimeout 
            ? "Delete request timed out. Team may have been deleted. Refreshing..."
            : "Team removed (may have already been deleted)",
        });
        // Force refetch after timeout/404
        setTimeout(() => {
          refetchTeams();
        }, 500);
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to delete team",
          variant: "destructive",
        });
      }
    },
    onSuccess: () => {
      console.log('[Teams] ✅ Delete successful');
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.teams() });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams(orgId || undefined) });
      refetchTeams(); // Force refetch
      toast({
        title: "Success",
        description: "Team deleted successfully",
      });
    },
  });

  const handleDeleteTeam = (teamId: string) => {
    deleteTeamMutation.mutate(teamId);
  };

  const handleCreateTeam = () => {
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

    // Check for duplicate team name in the same organization
    const orgTeams = teams.filter((team: any) => team.organization_id === newTeamOrgId);
    const duplicateTeam = orgTeams.find((team: any) => 
      team.name.toLowerCase().trim() === newTeamName.toLowerCase().trim()
    );
    
    if (duplicateTeam) {
      toast({
        title: "Duplicate Team Name",
        description: `A team named "${newTeamName}" already exists in this organization. Please choose a different name.`,
        variant: "destructive",
      });
      return;
    }

    createTeamMutation.mutate({
      name: newTeamName,
      orgId: newTeamOrgId,
      description: newTeamDescription || undefined,
    });
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
                <Button onClick={handleCreateTeam} disabled={createTeamMutation.isPending || organizations.length === 0}>
                  {createTeamMutation.isPending ? (
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
                            disabled={deleteTeamMutation.isPending && deleteTeamMutation.variables === team.id}
                          >
                            {deleteTeamMutation.isPending && deleteTeamMutation.variables === team.id ? (
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
                    <Link 
                      to={`/teams/${team.id}`}
                      onMouseEnter={() => prefetchTeam.prefetch(team.id)}
                    >
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
