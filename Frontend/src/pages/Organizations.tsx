import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Building2, Users, FolderGit2, ArrowRight, Loader2, Info, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import apiClient from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/layout/Navbar";
import { useOrganizations, useOrganizationTeams, useOrganizationRepositories, usePrefetchOrganization, queryKeys } from "@/hooks/useApiQueries";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function Organizations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const prefetchOrg = usePrefetchOrganization();
  
  // Use React Query for instant loading with cached data
  const { data: organizations = [], isLoading: orgsLoading, refetch: refetchOrgs } = useOrganizations({
    placeholderData: (previousData) => previousData,
    refetchOnMount: true, // Always refetch on mount to get latest data
  });
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgPlan, setNewOrgPlan] = useState("free");
  
  // Show loading only if we have no cached data
  const loading = orgsLoading && organizations.length === 0;

  // Fetch stats for organizations - React Query handles caching automatically
  // We'll compute stats from individual queries as needed
  const getOrgStats = (orgId: string) => {
    const teamsQuery = queryClient.getQueryData(queryKeys.organizationTeams(orgId)) as any[] | undefined;
    const reposQuery = queryClient.getQueryData(queryKeys.organizationRepositories(orgId)) as any[] | undefined;
    return {
      teams: teamsQuery?.length || 0,
      repos: reposQuery?.length || 0,
      loading: false, // Data is cached or loading in background
    };
  };

  // Prefetch stats ONLY if not already cached (avoid unnecessary API calls)
  useEffect(() => {
    if (organizations.length === 0) return;
    
    organizations.forEach(org => {
      // Validate org.id before making API calls
      if (!org.id || org.id === 'undefined' || org.id === 'null') {
        console.warn('[Organizations] ⚠️ Skipping prefetch for invalid org:', org);
        return;
      }
      
      // Only prefetch if data doesn't exist in cache
      const cachedTeams = queryClient.getQueryData(queryKeys.organizationTeams(org.id));
      const cachedRepos = queryClient.getQueryData(queryKeys.organizationRepositories(org.id));
      
      if (!cachedTeams) {
        queryClient.prefetchQuery({
          queryKey: queryKeys.organizationTeams(org.id),
          queryFn: () => apiClient.listOrganizationTeams(org.id),
          staleTime: 10 * 60 * 1000,
        });
      }
      if (!cachedRepos) {
        queryClient.prefetchQuery({
          queryKey: queryKeys.organizationRepositories(org.id),
          queryFn: () => apiClient.getOrganizationRepositories(org.id),
          staleTime: 10 * 60 * 1000,
        });
      }
    });
  }, [organizations, queryClient]);

  const createOrgMutation = useMutation({
    mutationFn: ({ name, plan }: { name: string; plan: string }) =>
      apiClient.createOrganization(name, plan),
    onMutate: async () => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.organizations });
    },
    onSuccess: (newOrg) => {
      console.log('[Organizations] ✅ Created organization:', newOrg);
      
      // Optimistically add new organization to cache
      queryClient.setQueryData(queryKeys.organizations, (old: any[] = []) => {
        // Check if already exists (avoid duplicates)
        if (old.some((org: any) => org.id === newOrg.id)) {
          console.log('[Organizations] ⚠️ Organization already in cache, skipping add');
          return old;
        }
        console.log('[Organizations] ➕ Adding new org to cache:', newOrg.name);
        return [...old, newOrg];
      });
      
      setCreateDialogOpen(false);
      setNewOrgName("");
      setNewOrgPlan("free");
      toast({
        title: "Success",
        description: "Organization created successfully",
      });
      
      // Force refetch to ensure we have latest data from backend
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
        refetchOrgs();
      }, 100);
    },
    onError: (error: any) => {
      console.error('[Organizations] ❌ Failed to create organization:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create organization",
        variant: "destructive",
      });
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      console.log('[Organizations] 🗑️ Deleting organization:', orgId);
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
      
      console.log('[Organizations] 📸 Snapshot before delete:', previousOrgs);
      
      // Optimistically remove organization from cache
      queryClient.setQueryData(queryKeys.organizations, (old: any[] = []) => {
        const filtered = old.filter((org: any) => org.id !== orgId);
        console.log('[Organizations] ➖ Removed org from cache. Before:', old.length, 'After:', filtered.length);
        return filtered;
      });
      
      return { previousOrgs, previousOrg };
    },
    onError: (error: any, orgId, context) => {
      console.error('[Organizations] ❌ Delete failed:', error, 'orgId:', orgId);
      
      // Rollback on error (unless it's a timeout or 404)
      const isTimeout = error?.message?.includes('timeout');
      const is404 = error?.message?.includes('404') || error?.status === 404;
      
      if (!isTimeout && !is404 && context?.previousOrgs) {
        console.log('[Organizations] 🔄 Rolling back cache');
        queryClient.setQueryData(queryKeys.organizations, context.previousOrgs);
      }
      if (!isTimeout && !is404 && context?.previousOrg) {
        queryClient.setQueryData(queryKeys.organization(orgId), context.previousOrg);
      }
      
      // If 404 or timeout, the org might already be deleted - remove it from cache anyway
      if (is404 || isTimeout) {
        console.log('[Organizations] ⚠️', isTimeout ? 'Timeout' : '404', '- removing from cache anyway');
        queryClient.setQueryData(queryKeys.organizations, (old: any[] = []) => 
          old.filter((org: any) => org.id !== orgId)
        );
        toast({
          title: isTimeout ? "Timeout" : "Success",
          description: isTimeout 
            ? "Delete request timed out. Organization may have been deleted. Refreshing..."
            : "Organization removed (may have already been deleted)",
        });
        // Force refetch after timeout/404
        setTimeout(() => {
          refetchOrgs();
        }, 500);
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to delete organization",
          variant: "destructive",
        });
      }
    },
    onSuccess: () => {
      console.log('[Organizations] ✅ Delete successful');
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
      queryClient.invalidateQueries({ queryKey: queryKeys.teams() });
      refetchOrgs(); // Force refetch
      toast({
        title: "Success",
        description: "Organization deleted successfully",
      });
    },
  });

  const handleDeleteOrganization = (orgId: string) => {
    deleteOrgMutation.mutate(orgId);
  };

  const handleCreateOrganization = () => {
    if (!newOrgName.trim()) {
      toast({
        title: "Error",
        description: "Organization name is required",
        variant: "destructive",
      });
      return;
    }
    createOrgMutation.mutate({ name: newOrgName, plan: newOrgPlan });
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
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Organizations</h1>
            <p className="text-muted-foreground mt-2">
              Group your repositories and teams together. Organizations help you monitor overall health across multiple teams and compare performance.
            </p>
          </div>
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Organization
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Organization</DialogTitle>
                <DialogDescription>
                  Create a new organization to manage teams and repositories
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Organization Name</Label>
                  <Input
                    id="name"
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="My Organization"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan">Plan</Label>
                  <Select value={newOrgPlan} onValueChange={setNewOrgPlan}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free">Free</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateOrganization} disabled={createOrgMutation.isPending}>
                  {createOrgMutation.isPending ? (
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

        {organizations.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Building2 className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No organizations yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first organization to get started
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Organization
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {organizations.map((org) => (
              <Card key={org.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Building2 className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{org.name}</CardTitle>
                        <CardDescription className="capitalize">{org.plan_type}</CardDescription>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          disabled={deleteOrgMutation.isPending && deleteOrgMutation.variables === org.id}
                        >
                          {deleteOrgMutation.isPending && deleteOrgMutation.variables === org.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Organization</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete <strong>"{org.name}"</strong>? 
                            This will remove all teams, repositories, and data associated with this organization. 
                            This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDeleteOrganization(org.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete Organization
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>
                        Teams:{" "}
                        {(() => {
                          const stats = getOrgStats(org.id);
                          return stats.loading ? (
                            <Skeleton className="inline-block h-4 w-6 ml-1" />
                          ) : (
                            <span className="font-medium text-foreground">{stats.teams}</span>
                          );
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FolderGit2 className="h-4 w-4" />
                      <span>
                        Repositories:{" "}
                        {(() => {
                          const stats = getOrgStats(org.id);
                          return stats.loading ? (
                            <Skeleton className="inline-block h-4 w-6 ml-1" />
                          ) : (
                            <span className="font-medium text-foreground">{stats.repos}</span>
                          );
                        })()}
                      </span>
                    </div>
                    <Link 
                      to={`/organizations/${org.id}`}
                      onMouseEnter={() => prefetchOrg.prefetch(org.id)}
                    >
                      <Button variant="outline" className="w-full">
                        View Details
                        <ArrowRight className="h-4 w-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Concept Explanation Card - Moved below organizations list */}
        <Card className="mt-8 bg-muted/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">What are Organizations?</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <strong>Organizations</strong> represent your company, department, or division. They help you:
            </p>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside ml-2">
              <li>Group related teams and repositories together</li>
              <li>Monitor overall health across all your teams</li>
              <li>Compare team performance side-by-side</li>
              <li>Track organization-wide metrics and risk scores</li>
              <li>Identify which teams need support or training</li>
            </ul>
            <p className="text-sm text-muted-foreground mt-3">
              <strong>Example:</strong> If you're monitoring Frontend Team (score: 85) and Backend Team (score: 60), 
              you immediately know the Backend Team needs attention. Without organizations, you'd just see 10 disconnected repositories.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
