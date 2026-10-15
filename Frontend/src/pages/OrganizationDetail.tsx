import { useState, type ComponentType, type ReactNode } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Users,
  FolderGit2,
  Settings,
  Loader2,
  Plus,
  BarChart3,
  AlertTriangle,
  ChevronRight,
  Edit2,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useOrganization, useOrganizationTeams, useOrganizationRepositories, queryKeys } from "@/hooks/useApiQueries";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { OrganizationAlerts } from "@/components/alerts/OrganizationAlerts";
import { useOrganizationAlerts } from "@/hooks/useNotificationQueries";
import { PageHeader } from "@/components/organizations/PageHeader";
import { ErrorState, LoadingCard, LoadingState } from "@/components/organizations/PageStates";

const TABS = ["overview", "alerts", "teams", "repositories", "settings"] as const;

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // ?tab=alerts (linked from the executive dashboard) opens that tab.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initialTab = TABS.find((t) => t === requestedTab) ?? "overview";
  const { data: openAlerts = [] } = useOrganizationAlerts(id, false);
  
  // Use React Query for instant loading with cached data
  const {
    data: organization,
    isLoading: orgLoading,
    error: orgError,
    refetch: refetchOrg,
    isFetching: orgFetching,
  } = useOrganization(id || "", {
    placeholderData: (previousData) => previousData,
  });
  const {
    data: teams = [],
    isLoading: teamsLoading,
    error: teamsError,
    refetch: refetchTeams,
    isFetching: teamsFetching,
  } = useOrganizationTeams(id || "", {
    placeholderData: (previousData) => previousData,
  });
  const {
    data: repositories = [],
    isLoading: reposLoading,
    error: reposError,
    refetch: refetchRepos,
    isFetching: reposFetching,
  } = useOrganizationRepositories(id || "", {
    placeholderData: (previousData) => previousData,
  });
  
  const [editingName, setEditingName] = useState(false);
  // Seeded when editing starts. This used to be reset to organization.name
  // during every render whenever the two differed - which is every render after
  // a keystroke - so the field could never hold an edited value.
  const [newName, setNewName] = useState("");

  // Show loading only if we have no cached data
  const loading = orgLoading && !organization;

  const startEditingName = () => {
    setNewName(organization?.name || "");
    setEditingName(true);
  };

  const updateOrgMutation = useMutation({
    mutationFn: ({ orgId, name }: { orgId: string; name: string }) =>
      apiClient.updateOrganization(orgId, { name: name }),
    onSuccess: (updated, { name }) => {
      // Show the new name straight away: this query does not refetch on mount
      // and serves cached data, so waiting on the invalidation alone could
      // leave the old name on screen.
      queryClient.setQueryData(queryKeys.organization(id!), (old: Record<string, unknown> | undefined) =>
        old ? { ...old, ...(updated && typeof updated === "object" ? updated : {}), name } : old
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.organization(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
      setEditingName(false);
      toast({
        title: "Success",
        description: "Organization name updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update organization",
        variant: "destructive",
      });
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Delete request timed out')), 10000)
      );
      const deletePromise = apiClient.deleteOrganization(orgId);
      return Promise.race([deletePromise, timeoutPromise]) as Promise<void>;
    },
    onMutate: async (orgId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations });
      await queryClient.cancelQueries({ queryKey: queryKeys.organization(orgId) });
      
      // Snapshot previous values
      const previousOrgs = queryClient.getQueryData(queryKeys.organizations);
      const previousOrg = queryClient.getQueryData(queryKeys.organization(orgId));
      
      // Optimistically remove organization from cache
      queryClient.setQueryData(queryKeys.organizations, (old: any[] = []) => 
        old.filter((org: any) => org.id !== orgId)
      );
      
      // Navigate immediately for instant feedback
      navigate("/organizations");
      
      return { previousOrgs, previousOrg };
    },
    onError: (error: any, orgId, context) => {
      const isTimeout = error?.message?.includes('timeout');
      const is404 = error?.message?.includes('404') || error?.status === 404;
      
      // Rollback on error (unless timeout or 404)
      if (!isTimeout && !is404) {
        if (context?.previousOrgs) {
          queryClient.setQueryData(queryKeys.organizations, context.previousOrgs);
        }
        if (context?.previousOrg) {
          queryClient.setQueryData(queryKeys.organization(orgId), context.previousOrg);
        }
        // Navigate back if error
        navigate(`/organizations/${orgId}`);
      }
      
      // If 404 or timeout, the org might already be deleted - show success message
      if (is404 || isTimeout) {
        toast({
          title: isTimeout ? "Timeout" : "Success",
          description: isTimeout 
            ? "Delete request timed out. Organization may have been deleted."
            : "Organization removed (may have already been deleted)",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to delete organization",
          variant: "destructive",
        });
      }
    },
    onSuccess: () => {
      // Invalidate to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams() });
      toast({
        title: "Success",
        description: "Organization deleted successfully",
      });
    },
  });

  const trimmedName = newName.trim();
  const nameUnchanged = trimmedName === (organization?.name || "");

  const handleUpdateName = () => {
    if (!id || !trimmedName) return;
    if (nameUnchanged) {
      setEditingName(false);
      return;
    }
    updateOrgMutation.mutate({ orgId: id, name: trimmedName });
  };

  const handleDelete = () => {
    if (!id) return;
    deleteOrgMutation.mutate(id);
  };

  if (loading && !organization) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8 max-w-7xl pt-24">
          <LoadingState label="Loading organization…" className="min-h-[60vh]" />
        </main>
      </div>
    );
  }

  if (orgError || (!organization && !orgLoading)) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="container mx-auto px-4 py-8 max-w-7xl pt-24">
          <PageHeader
            breadcrumb={[{ label: "Organizations", to: "/organizations" }, { label: "Not found" }]}
            title="Organization unavailable"
          />
          <ErrorState
            title="Couldn't load this organization. It may not exist, or you may not be a member."
            error={orgError}
            onRetry={orgError ? () => refetchOrg() : undefined}
            retrying={orgFetching}
          >
            <Button variant="ghost" asChild>
              <Link to="/organizations">Back to organizations</Link>
            </Button>
          </ErrorState>
        </main>
      </div>
    );
  }

  const createdOn = new Date(organization.created_at).toLocaleDateString();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-7xl pt-24">
        <PageHeader
          breadcrumb={[{ label: "Organizations", to: "/organizations" }, { label: organization.name }]}
          title={organization.name}
          description={`Created ${createdOn}`}
          actions={
            <Button variant="outline" className="gap-2" asChild>
              <Link to={`/executive/${id}`}>
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                Executive dashboard
              </Link>
            </Button>
          }
        />

        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="alerts">
              Alerts
              {openAlerts.length > 0 && (
                <Badge variant="destructive" className="ml-2 h-5 px-1.5" aria-label={`${openAlerts.length} open`}>
                  {openAlerts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="teams">Teams ({teams.length})</TabsTrigger>
            <TabsTrigger value="repositories">Repositories ({repositories.length})</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* Overview: what this organization holds. Health, risk and team
              rankings live on the executive dashboard, linked below, rather
              than being repeated here. */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard title="Teams" value={teams.length} caption="In this organization" icon={Users} />
              <StatCard
                title="Repositories"
                value={repositories.length}
                caption="Assigned to its teams"
                icon={FolderGit2}
              />
              <StatCard
                title="Open alerts"
                value={
                  <span className={openAlerts.length > 0 ? "text-destructive" : undefined}>{openAlerts.length}</span>
                }
                caption={openAlerts.length > 0 ? "See the Alerts tab" : "Nothing needs attention"}
                icon={AlertTriangle}
              />
            </div>

            <Card>
              <CardContent className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <BarChart3 className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Health, risk and team performance</p>
                    <p className="text-sm text-muted-foreground">
                      The organization's health score, business risk and team leaderboard are on the executive
                      dashboard.
                    </p>
                  </div>
                </div>
                <Button className="gap-2 shrink-0" asChild>
                  <Link to={`/executive/${id}`}>
                    Open executive dashboard
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick actions</CardTitle>
                <CardDescription>Common tasks for managing this organization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-1" asChild>
                    <Link to={`/teams?org=${id}`}>
                      <Plus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      <span>Create team</span>
                      <span className="text-xs font-normal text-muted-foreground">Add a new team</span>
                    </Link>
                  </Button>
                  <Button variant="outline" className="h-auto py-4 flex flex-col items-center gap-1" asChild>
                    <Link to="/repos">
                      <FolderGit2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                      <span>Assign repository</span>
                      <span className="text-xs font-normal text-muted-foreground">Link repositories to teams</span>
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {teams.length > 0 && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <div className="space-y-1.5">
                    <CardTitle className="text-lg">Teams</CardTitle>
                    <CardDescription>This organization's teams</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link to={`/teams?org=${id}`}>
                      View all <ChevronRight className="h-3 w-3 ml-1" aria-hidden="true" />
                    </Link>
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {teams.slice(0, 3).map((team) => (
                      <Link
                        key={team.id}
                        to={`/teams/${team.id}`}
                        className="flex items-center gap-3 p-4 border rounded-lg hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Users className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{team.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {team.description || "No description"}
                          </p>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="space-y-4">
            <OrganizationAlerts orgId={id!} />
          </TabsContent>

          {/* Teams Tab */}
          <TabsContent value="teams" className="space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h2 className="text-xl font-semibold">Teams</h2>
                <p className="text-sm text-muted-foreground">Manage this organization's teams</p>
              </div>
              <Button className="gap-2" asChild>
                <Link to={`/teams?org=${id}`}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create team
                </Link>
              </Button>
            </div>
            {/* Loading first: the empty state below reads as a real answer. */}
            {teamsLoading && teams.length === 0 ? (
              <LoadingCard label="Loading teams…" />
            ) : teamsError && teams.length === 0 ? (
              <ErrorState
                title="Couldn't load teams"
                error={teamsError}
                onRetry={() => refetchTeams()}
                retrying={teamsFetching}
              />
            ) : teams.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Users className="h-8 w-8 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
                  <h3 className="text-lg font-semibold mb-2">No teams yet</h3>
                  <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                    Create teams to organize developers and track their code quality. Use Create team above.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {teams.map((team) => (
                  <Card key={team.id}>
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <Users className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <CardTitle className="text-lg">{team.name}</CardTitle>
                          {team.description && (
                            <CardDescription className="line-clamp-2">{team.description}</CardDescription>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button variant="outline" className="w-full" asChild>
                        <Link to={`/teams/${team.id}`}>View team</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Repositories Tab */}
          <TabsContent value="repositories" className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Repositories</h2>
              <p className="text-sm text-muted-foreground">Repositories assigned to this organization's teams</p>
            </div>
            {/* Loading first: the empty state below reads as a real answer. */}
            {reposLoading && repositories.length === 0 ? (
              <LoadingCard label="Loading repositories…" />
            ) : reposError && repositories.length === 0 ? (
              <ErrorState
                title="Couldn't load repositories"
                error={reposError}
                onRetry={() => refetchRepos()}
                retrying={reposFetching}
              />
            ) : repositories.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <FolderGit2 className="h-8 w-8 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
                  <h3 className="text-lg font-semibold mb-2">No repositories assigned</h3>
                  <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                    Assign repositories to teams to start tracking code quality.
                  </p>
                  <Button variant="outline" asChild>
                    <Link to="/repos">Go to repositories</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {repositories.map((repo) => (
                  <Card key={repo.id}>
                    <CardHeader>
                      <div className="flex items-start gap-3">
                        <FolderGit2 className="h-5 w-5 mt-0.5 text-muted-foreground shrink-0" aria-hidden="true" />
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <CardTitle className="text-lg truncate">{repo.name}</CardTitle>
                          <CardDescription className="font-mono text-xs truncate">{repo.full_name}</CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <Button variant="outline" className="w-full" asChild>
                        <Link to={`/dashboard/${repo.id}`}>Open dashboard</Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold">Settings</h2>
              <p className="text-sm text-muted-foreground">Manage this organization's settings</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  General
                </CardTitle>
                <CardDescription>Basic organization information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Organization name</Label>
                  <div className="flex items-center gap-2">
                    {editingName ? (
                      <>
                        <Input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdateName();
                            if (e.key === "Escape") setEditingName(false);
                          }}
                          maxLength={100}
                          aria-label="Organization name"
                          className="max-w-xs"
                          autoFocus
                        />
                        <Button
                          onClick={handleUpdateName}
                          disabled={updateOrgMutation.isPending || !trimmedName}
                          size="sm"
                        >
                          {updateOrgMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-label="Saving" />
                          ) : (
                            "Save"
                          )}
                        </Button>
                        <Button variant="ghost" onClick={() => setEditingName(false)} size="sm">
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="text-lg">{organization.name}</span>
                        <Button variant="ghost" size="icon" onClick={startEditingName} aria-label="Rename organization">
                          <Edit2 className="h-4 w-4" aria-hidden="true" />
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

            {/* Plan. Organizations are free-plan only: the backend ignores
                plan_type and there is no billing, so this is a statement of
                fact, not a choice. */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Zap className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                  Plan
                </CardTitle>
                <CardDescription>Every organization is on the free plan</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-4 border rounded-lg">
                  <p className="font-semibold">Free plan</p>
                  <p className="text-sm text-muted-foreground">There is nothing to upgrade or pay for.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick links</CardTitle>
                <CardDescription>Pages related to this organization</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Button variant="outline" className="w-full justify-start gap-2" asChild>
                    <Link to={`/teams?org=${id}`}>
                      <Users className="h-4 w-4" aria-hidden="true" />
                      Manage teams
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" asChild>
                    <Link to={`/executive/${id}`}>
                      <BarChart3 className="h-4 w-4" aria-hidden="true" />
                      Executive dashboard
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-2" asChild>
                    <Link to="/repos">
                      <FolderGit2 className="h-4 w-4" aria-hidden="true" />
                      All repositories
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-destructive/50">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                  Danger zone
                </CardTitle>
                <CardDescription>Irreversible actions</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-destructive/30 rounded-lg">
                  <div>
                    <p className="font-medium">Delete organization</p>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete this organization and all its data
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive">
                        <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {organization.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This can't be undone. It permanently deletes the organization{" "}
                          <strong>"{organization.name}"</strong> and all its teams and settings.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleDelete}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={deleteOrgMutation.isPending}
                        >
                          {deleteOrgMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-4 w-4 mr-2" aria-hidden="true" />
                          )}
                          Delete organization
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function StatCard({
  title,
  value,
  caption,
  icon: Icon,
}: {
  title: string;
  value: ReactNode;
  caption: string;
  icon: ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold tabular-nums">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{caption}</p>
      </CardContent>
    </Card>
  );
}
