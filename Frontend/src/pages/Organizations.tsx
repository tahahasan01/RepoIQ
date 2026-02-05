import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Plus, Building2, Users, FolderGit2, ArrowRight, Loader2, Info } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import apiClient from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/layout/Navbar";

// Cache keys
const ORGS_CACHE_KEY = "repoiq_orgs_cache";
const ORG_STATS_CACHE_KEY = "repoiq_org_stats_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export default function Organizations() {
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgPlan, setNewOrgPlan] = useState("free");
  const [creating, setCreating] = useState(false);
  const [orgStats, setOrgStats] = useState<Record<string, { teams: number; repos: number; loading: boolean }>>({});
  const { toast } = useToast();

  // Load from cache first for instant display
  useEffect(() => {
    const cachedOrgs = sessionStorage.getItem(ORGS_CACHE_KEY);
    const cachedStats = sessionStorage.getItem(ORG_STATS_CACHE_KEY);
    
    if (cachedOrgs) {
      try {
        const { data, timestamp } = JSON.parse(cachedOrgs);
        if (Date.now() - timestamp < CACHE_TTL) {
          setOrganizations(data);
          setLoading(false);
        }
      } catch {}
    }
    
    if (cachedStats) {
      try {
        const { data, timestamp } = JSON.parse(cachedStats);
        if (Date.now() - timestamp < CACHE_TTL) {
          setOrgStats(data);
        }
      } catch {}
    }
    
    loadOrganizations();
  }, []);

  // Fetch stats for each organization in parallel
  useEffect(() => {
    if (organizations.length > 0) {
      // Check if we have cached stats that are still valid
      const cachedStats = sessionStorage.getItem(ORG_STATS_CACHE_KEY);
      if (cachedStats) {
        try {
          const { data, timestamp } = JSON.parse(cachedStats);
          if (Date.now() - timestamp < CACHE_TTL) {
            // Already have valid cache, skip loading state
            setOrgStats(data);
            return;
          }
        } catch {}
      }

      // Initialize loading state for all orgs
      const initialStats: Record<string, { teams: number; repos: number; loading: boolean }> = {};
      organizations.forEach(org => {
        // Keep existing value if available, just mark as loading
        initialStats[org.id] = orgStats[org.id] 
          ? { ...orgStats[org.id], loading: true }
          : { teams: 0, repos: 0, loading: true };
      });
      setOrgStats(initialStats);

      // Fetch stats in parallel
      Promise.all(
        organizations.map(async (org) => {
          try {
            const [teams, repos] = await Promise.all([
              apiClient.listOrganizationTeams(org.id),
              apiClient.getOrganizationRepositories(org.id)
            ]);
            return { orgId: org.id, teams: teams.length, repos: repos.length };
          } catch {
            return { orgId: org.id, teams: 0, repos: 0 };
          }
        })
      ).then(results => {
        const stats: Record<string, { teams: number; repos: number; loading: boolean }> = {};
        results.forEach(r => {
          stats[r.orgId] = { teams: r.teams, repos: r.repos, loading: false };
        });
        setOrgStats(stats);
        // Cache the stats
        sessionStorage.setItem(ORG_STATS_CACHE_KEY, JSON.stringify({ data: stats, timestamp: Date.now() }));
      });
    }
  }, [organizations]);

  const loadOrganizations = async () => {
    try {
      // Only show loading if no cached data
      if (organizations.length === 0) {
        setLoading(true);
      }
      const orgs = await apiClient.listOrganizations();
      setOrganizations(orgs);
      // Cache the organizations
      sessionStorage.setItem(ORGS_CACHE_KEY, JSON.stringify({ data: orgs, timestamp: Date.now() }));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load organizations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrganization = async () => {
    if (!newOrgName.trim()) {
      toast({
        title: "Error",
        description: "Organization name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      setCreating(true);
      const org = await apiClient.createOrganization(newOrgName, newOrgPlan);
      setOrganizations([...organizations, org]);
      setCreateDialogOpen(false);
      setNewOrgName("");
      setNewOrgPlan("free");
      toast({
        title: "Success",
        description: "Organization created successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create organization",
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
                <Button onClick={handleCreateOrganization} disabled={creating}>
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
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>
                        Teams:{" "}
                        {orgStats[org.id]?.loading ? (
                          <Skeleton className="inline-block h-4 w-6 ml-1" />
                        ) : (
                          <span className="font-medium text-foreground">{orgStats[org.id]?.teams ?? 0}</span>
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FolderGit2 className="h-4 w-4" />
                      <span>
                        Repositories:{" "}
                        {orgStats[org.id]?.loading ? (
                          <Skeleton className="inline-block h-4 w-6 ml-1" />
                        ) : (
                          <span className="font-medium text-foreground">{orgStats[org.id]?.repos ?? 0}</span>
                        )}
                      </span>
                    </div>
                    <Link to={`/organizations/${org.id}`}>
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
