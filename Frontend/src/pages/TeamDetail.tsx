import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Users,
  FolderGit2,
  UserPlus,
  ArrowLeft,
  Loader2,
  Trash2,
  Activity,
  TrendingUp,
  AlertTriangle,
  Shield,
  Code2,
  GitCommit,
  Plus,
  ChevronRight,
  BarChart3,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import apiClient from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/layout/Navbar";
import { useTeam, useTeamMembers, useTeamRepositories, queryKeys } from "@/hooks/useApiQueries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Use React Query for instant loading with cached data
  const { data: team, isLoading: teamLoading, error: teamError, isFetching: teamFetching } = useTeam(id || "", {
    // Show cached data immediately, refetch in background
    placeholderData: (previousData) => previousData,
    // Don't refetch on mount if we have cached data
    refetchOnMount: false,
  });
  const { data: members = [], isLoading: membersLoading, isFetching: membersFetching } = useTeamMembers(id || "", {
    placeholderData: (previousData) => previousData,
    refetchOnMount: false,
  });
  const { data: repositories = [], isLoading: reposLoading, isFetching: reposFetching } = useTeamRepositories(id || "", {
    placeholderData: (previousData) => previousData,
    refetchOnMount: false,
  });
  
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("member");
  
  // Show loading only if we have no cached data at all
  // If we have cached data, show it immediately even if refetching in background
  const loading = (teamLoading && !team) || (membersLoading && members.length === 0 && !team) || (reposLoading && repositories.length === 0 && !team);

  // Optimistic mutations for instant UI updates
  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => apiClient.removeTeamMember(id!, userId),
    onMutate: async (userId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.teamMembers(id!) });
      
      // Snapshot previous value
      const previousMembers = queryClient.getQueryData(queryKeys.teamMembers(id!));
      
      // Optimistically update
      queryClient.setQueryData(queryKeys.teamMembers(id!), (old: any[]) => 
        old?.filter((m: any) => m.user_id !== userId) || []
      );
      
      return { previousMembers };
    },
    onError: (err, userId, context) => {
      // Rollback on error
      if (context?.previousMembers) {
        queryClient.setQueryData(queryKeys.teamMembers(id!), context.previousMembers);
      }
      toast({
        title: "Error",
        description: "Failed to remove member",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Member removed successfully",
      });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) => 
      apiClient.addTeamMember(id!, userId, role),
    onSuccess: () => {
      // Invalidate to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers(id!) });
      setAddMemberDialogOpen(false);
      setNewMemberUserId("");
      setNewMemberRole("member");
      toast({
        title: "Success",
        description: "Member added successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add member",
        variant: "destructive",
      });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: () => apiClient.deleteTeam(id!),
    onMutate: async () => {
      if (!id) return;
      
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.teams() });
      await queryClient.cancelQueries({ queryKey: queryKeys.team(id) });
      
      // Snapshot previous values
      const previousTeamsAll = queryClient.getQueryData(queryKeys.teams());
      const previousTeam = queryClient.getQueryData(queryKeys.team(id));
      
      // Optimistically remove team from cache
      queryClient.setQueryData(queryKeys.teams(), (old: any[] = []) => 
        old.filter((team: any) => team.id !== id)
      );
      
      // Navigate immediately for instant feedback
      navigate("/teams");
      
      return { previousTeamsAll, previousTeam };
    },
    onError: (error: any, _, context) => {
      // Rollback on error
      if (context?.previousTeamsAll) {
        queryClient.setQueryData(queryKeys.teams(), context.previousTeamsAll);
      }
      if (context?.previousTeam && id) {
        queryClient.setQueryData(queryKeys.team(id), context.previousTeam);
      }
      // Navigate back if error
      if (id) navigate(`/teams/${id}`);
      toast({
        title: "Error",
        description: error.message || "Failed to delete team",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.teams() });
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
      toast({
        title: "Success",
        description: "Team deleted successfully",
      });
    },
  });

  const handleRemoveMember = (userId: string) => {
    if (!id) return;
    removeMemberMutation.mutate(userId);
  };

  const handleAddMember = () => {
    if (!id) return;
    const trimmedIdentifier = newMemberUserId.trim();
    
    if (!trimmedIdentifier) {
      toast({
        title: "Error",
        description: "Please enter a user name, username, email, or user ID",
        variant: "destructive",
      });
      return;
    }

    addMemberMutation.mutate({ 
      userId: trimmedIdentifier, 
      role: newMemberRole 
    });
  };

  const handleDeleteTeam = () => {
    if (!id) return;
    deleteTeamMutation.mutate();
  };

  // Show page immediately with cached data, loading indicator only if no data at all
  if (loading && !team) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading team details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (teamError || (!team && !teamLoading)) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 pt-24">
          <Card>
            <CardContent className="py-16 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground mb-4">Team not found</p>
              <Link to="/teams">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Teams
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const roleColors: Record<string, string> = {
    lead: "bg-yellow-500 text-white",
    member: "bg-blue-500 text-white",
    admin: "bg-purple-500 text-white",
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 py-8 max-w-7xl pt-24">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/teams">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center shadow-lg">
                  <Users className="h-8 w-8 text-white" />
                </div>
              </div>
              <div>
                <h1 className="text-3xl font-bold">{team.name}</h1>
                <div className="flex items-center gap-2 mt-1">
                  {team.organization && (
                    <>
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <Link to={`/organizations/${team.organization_id}`} className="text-muted-foreground hover:text-primary transition-colors">
                        {team.organization.name || "Organization"}
                      </Link>
                      <span className="text-muted-foreground">•</span>
                    </>
                  )}
                  <span className="text-muted-foreground">
                    {members.length} member{members.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {team.description && (
                  <p className="text-muted-foreground mt-2 max-w-xl">{team.description}</p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button className="gap-2" onClick={() => setAddMemberDialogOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Add Member
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground">
                  <Trash2 className="h-4 w-4" />
                  Delete Team
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
                    onClick={handleDeleteTeam}
                    disabled={deleteTeamMutation.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteTeamMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      "Delete Team"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Add Member Dialog */}
        <Dialog open={addMemberDialogOpen} onOpenChange={setAddMemberDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Team Member</DialogTitle>
              <DialogDescription>
                Add a new member to {team.name}. Enter their name, username, email, or user ID.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="userId">User Name, Username, Email, or ID</Label>
                <Input
                  id="userId"
                  value={newMemberUserId}
                  onChange={(e) => setNewMemberUserId(e.target.value)}
                  placeholder="e.g., john, john@example.com, or user ID"
                />
                <p className="text-xs text-muted-foreground">
                  Enter the user's name, GitHub username, email address, or user ID. The user must already have a RepoIQ account.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddMemberDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddMember} disabled={addMemberMutation.isPending}>
                {addMemberMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Member"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-blue-500/10 to-blue-600/5">
            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/10 rounded-full -mr-10 -mt-10" />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Members
              </CardTitle>
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{members.length}</div>
              <p className="text-xs text-muted-foreground mt-1">Active team members</p>
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
              <p className="text-xs text-muted-foreground mt-1">Assigned repositories</p>
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
                Issues
              </CardTitle>
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">--</div>
              <p className="text-xs text-muted-foreground mt-1">Total issues found</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="members" className="space-y-6">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="members" className="data-[state=active]:bg-background">
              <Users className="h-4 w-4 mr-2" />
              Members ({members.length})
            </TabsTrigger>
            <TabsTrigger value="repositories" className="data-[state=active]:bg-background">
              <FolderGit2 className="h-4 w-4 mr-2" />
              Repositories ({repositories.length})
            </TabsTrigger>
            <TabsTrigger value="performance" className="data-[state=active]:bg-background">
              <BarChart3 className="h-4 w-4 mr-2" />
              Performance
            </TabsTrigger>
          </TabsList>

          {/* Members Tab */}
          <TabsContent value="members" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Team Members</h2>
                <p className="text-muted-foreground">Manage your team members and their roles</p>
              </div>
              <Button className="gap-2" onClick={() => setAddMemberDialogOpen(true)}>
                <UserPlus className="h-4 w-4" />
                Add Member
              </Button>
            </div>

            {members.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No members yet</h3>
                  <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
                    Add team members to start tracking their contributions and performance.
                  </p>
                  <Button onClick={() => setAddMemberDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add First Member
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {members.map((member) => {
                  const user = member.users || {};
                  return (
                    <Card key={member.user_id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-4">
                            <Avatar className="h-12 w-12 ring-2 ring-background shadow-md">
                              <AvatarImage src={user.avatar_url} />
                              <AvatarFallback className="bg-gradient-to-br from-primary to-cyan-500 text-white font-semibold">
                                {(user.full_name || user.github_username || "U")
                                  .slice(0, 2)
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-lg">
                                {user.full_name || user.github_username || "Unknown"}
                              </p>
                              {user.github_username && (
                                <p className="text-sm text-muted-foreground">@{user.github_username}</p>
                              )}
                              <Badge className={`mt-2 ${roleColors[member.role] || "bg-gray-500 text-white"}`}>
                                {member.role}
                              </Badge>
                            </div>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Member</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to remove{" "}
                                  <strong>{user.full_name || user.github_username || "this member"}</strong> from the team?
                                  This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleRemoveMember(member.user_id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>

                        {/* Member Stats Placeholder */}
                        <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-lg font-semibold">--</p>
                            <p className="text-xs text-muted-foreground">Commits</p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold">--</p>
                            <p className="text-xs text-muted-foreground">Issues Fixed</p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold">--</p>
                            <p className="text-xs text-muted-foreground">Score</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Repositories Tab */}
          <TabsContent value="repositories" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Assigned Repositories</h2>
                <p className="text-muted-foreground">Repositories this team is responsible for</p>
              </div>
              <Button variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Assign Repository
              </Button>
            </div>

            {repositories.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                    <FolderGit2 className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No repositories assigned</h3>
                  <p className="text-muted-foreground mb-4 max-w-sm mx-auto">
                    Assign repositories to this team to start tracking code quality.
                  </p>
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" />
                    Assign Repository
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {repositories.map((repo) => (
                  <Card key={repo.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="p-3 bg-green-500/10 rounded-xl">
                            <FolderGit2 className="h-6 w-6 text-green-500" />
                          </div>
                          <div>
                            <h3 className="font-semibold text-lg">{repo.name}</h3>
                            <p className="text-sm text-muted-foreground">{repo.full_name}</p>
                          </div>
                        </div>
                        <Link to={`/dashboard/${repo.id}`}>
                          <Button variant="ghost" size="icon">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>

                      {/* Repository Stats */}
                      <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-2">
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Activity className="h-3 w-3 text-green-500" />
                            <span className="font-semibold">--</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Health</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <AlertTriangle className="h-3 w-3 text-orange-500" />
                            <span className="font-semibold">--</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Issues</p>
                        </div>
                        <div className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Shield className="h-3 w-3 text-purple-500" />
                            <span className="font-semibold">--</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Security</p>
                        </div>
                      </div>

                      <Link to={`/dashboard/${repo.id}`} className="block mt-4">
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

          {/* Performance Tab */}
          <TabsContent value="performance" className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold">Team Performance</h2>
              <p className="text-muted-foreground">Track your team's code quality metrics over time</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Performance Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-500" />
                    Performance Summary
                  </CardTitle>
                  <CardDescription>Overall team metrics</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Code Quality</span>
                      <span className="font-semibold">--</span>
                    </div>
                    <Progress value={0} className="h-2" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Security Score</span>
                      <span className="font-semibold">--</span>
                    </div>
                    <Progress value={0} className="h-2" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Best Practices</span>
                      <span className="font-semibold">--</span>
                    </div>
                    <Progress value={0} className="h-2" />
                  </div>
                </CardContent>
              </Card>

              {/* Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-blue-500" />
                    Recent Activity
                  </CardTitle>
                  <CardDescription>Team contributions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center h-40 text-muted-foreground">
                    <div className="text-center">
                      <GitCommit className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Analyze repositories to see activity</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Contributors */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Top Contributors
                </CardTitle>
                <CardDescription>Members with highest contributions</CardDescription>
              </CardHeader>
              <CardContent>
                {members.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Add team members to see top contributors
                  </div>
                ) : (
                  <div className="space-y-3">
                    {members.slice(0, 5).map((member, idx) => {
                      const user = member.users || {};
                      return (
                        <div key={member.user_id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${
                              idx === 0 ? "bg-yellow-500" :
                              idx === 1 ? "bg-slate-400" :
                              idx === 2 ? "bg-amber-600" :
                              "bg-muted-foreground"
                            }`}>
                              {idx + 1}
                            </div>
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={user.avatar_url} />
                              <AvatarFallback>
                                {(user.full_name || user.github_username || "U").slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-semibold">{user.full_name || user.github_username || "Unknown"}</p>
                              <p className="text-xs text-muted-foreground">{member.role}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">--</p>
                            <p className="text-xs text-muted-foreground">contributions</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
