import { useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Users,
  FolderGit2,
  UserPlus,
  ArrowLeft,
  Loader2,
  Trash2,
  Activity,
  AlertTriangle,
  GitCommit,
  Plus,
  ChevronRight,
  BarChart3,
  Building2,
  Lock,
  Unlink,
} from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import apiClient, { type TeamSummary } from "@/lib/api";
import { scoreColor, scoreLabel } from "@/lib/scoreColor";
import { useToast } from "@/hooks/use-toast";
import { Navbar } from "@/components/layout/Navbar";
import { useCurrentUser, useRepositories, useTeam, queryKeys } from "@/hooks/useApiQueries";
import { teamSummaryKey, useTeamSummary } from "@/hooks/useTeamSummary";
import { useMutation, useQueryClient } from "@tanstack/react-query";

// The backend's team_members.role CHECK allows exactly these. The picker used
// to offer "admin", which the database rejected on every attempt.
const ROLES = [
  { value: "member", label: "Member" },
  { value: "lead", label: "Lead" },
  { value: "manager", label: "Manager" },
] as const;

const roleBadge: Record<string, string> = {
  manager: "bg-purple-500/15 text-purple-600 dark:text-purple-300 border-purple-500/30",
  lead: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  member: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
};

type Member = TeamSummary["members"][number];
type TeamRepo = TeamSummary["repositories"][number];

function initials(name: string | null | undefined) {
  return (name || "U").slice(0, 2).toUpperCase();
}

function displayName(member: Member) {
  return member.user?.full_name || member.user?.github_username || "Unknown member";
}

function ScoreValue({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span className="text-muted-foreground">Not scored</span>;
  }
  return (
    <span style={{ color: scoreColor(score) }} title={scoreLabel(score)}>
      {Math.round(score)}
    </span>
  );
}

function StatCard({
  title,
  value,
  caption,
  icon: Icon,
}: {
  title: string;
  value: React.ReactNode;
  caption: string;
  icon: React.ComponentType<{ className?: string }>;
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

function ScoreTrend({ trends }: { trends: TeamSummary["trends"] }) {
  const data = trends.map((t) => ({ date: t.date, score: Math.round(t.average_score) }));

  // A trend needs two points; one dot in an empty grid reads as a broken chart.
  if (data.length < 2) {
    return (
      <div className="h-56 flex flex-col items-center justify-center gap-2 text-muted-foreground text-center">
        {data.length === 1 ? (
          <>
            <div className="text-4xl font-bold" style={{ color: scoreColor(data[0].score) }}>
              {data[0].score}
            </div>
            <p className="text-sm">Average on {data[0].date}. Analyze again to see the trend.</p>
          </>
        ) : (
          <p className="text-sm max-w-xs">
            No analyses in this period. Analyze a team repository to start the trend.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="h-56" role="img" aria-label={`Average team score over ${data.length} days`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="teamScoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          />
          <YAxis
            domain={[0, 100]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
          />
          <Tooltip
            formatter={(value: number) => [value, "Average score"]}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              color: "hsl(var(--foreground))",
            }}
          />
          <Area type="monotone" dataKey="score" stroke="#06b6d4" strokeWidth={2} fill="url(#teamScoreFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function AssignRepositoryDialog({
  open,
  onOpenChange,
  teamId,
  assignedIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  assignedIds: Set<string>;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selected, setSelected] = useState("");
  const [filter, setFilter] = useState("");
  // Only your own repositories can be assigned - the backend requires ownership.
  const { data: repos = [], isLoading } = useRepositories(1, 100, { enabled: open });

  const candidates = useMemo(
    () =>
      repos
        .filter((r: any) => !assignedIds.has(r.id))
        .filter((r: any) => (r.full_name || r.name || "").toLowerCase().includes(filter.toLowerCase())),
    [repos, assignedIds, filter]
  );

  const assign = useMutation({
    mutationFn: (repoId: string) => apiClient.assignRepositoryToTeam(teamId, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamSummaryKey(teamId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.teamRepositories(teamId) });
      toast({ title: "Repository assigned", description: "Team members can now see its scores here." });
      setSelected("");
      onOpenChange(false);
    },
    onError: (error: any) =>
      toast({ title: "Couldn't assign repository", description: error.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign a repository</DialogTitle>
          <DialogDescription>
            Team members will see this repository's scores and their contributions to it. File contents and findings
            stay visible to you only.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input
            placeholder="Filter your repositories"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter repositories"
          />
          <div className="max-h-64 overflow-y-auto rounded-md border divide-y" role="listbox" aria-label="Repositories">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading your repositories
              </div>
            ) : candidates.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                {repos.length === 0
                  ? "You have no synced repositories. Sync them from the Repositories page first."
                  : "Every repository you own is already on this team, or none match the filter."}
              </p>
            ) : (
              candidates.map((repo: any) => (
                <button
                  key={repo.id}
                  type="button"
                  role="option"
                  aria-selected={selected === repo.id}
                  onClick={() => setSelected(repo.id)}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-muted focus-visible:outline-none focus-visible:bg-muted ${
                    selected === repo.id ? "bg-primary/10" : ""
                  }`}
                >
                  <FolderGit2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{repo.full_name || repo.name}</span>
                  {repo.is_private && <Lock className="h-3 w-3 text-muted-foreground shrink-0" aria-label="Private" />}
                </button>
              ))
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => selected && assign.mutate(selected)} disabled={!selected || assign.isPending}>
            {assign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Assign repository
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: me } = useCurrentUser();
  const { data: team, isLoading: teamLoading, error: teamError } = useTeam(id || "");
  const { data: summary, isLoading: summaryLoading } = useTeamSummary(id);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [inviteIdentifier, setInviteIdentifier] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const members = summary?.members ?? [];
  const repositories = summary?.repositories ?? [];
  const metrics = summary?.metrics;
  const assignedIds = useMemo(() => new Set(repositories.map((r) => r.id)), [repositories]);
  const contributors = useMemo(
    () => [...members].sort((a, b) => b.total_commits - a.total_commits).filter((m) => m.total_commits > 0),
    [members]
  );

  const refreshTeam = () => {
    queryClient.invalidateQueries({ queryKey: teamSummaryKey(id!) });
    queryClient.invalidateQueries({ queryKey: queryKeys.teamMembers(id!) });
  };

  const removeMember = useMutation({
    mutationFn: (userId: string) => apiClient.removeTeamMember(id!, userId),
    onSuccess: () => {
      refreshTeam();
      toast({ title: "Member removed" });
    },
    onError: (error: any) =>
      toast({ title: "Couldn't remove member", description: error.message, variant: "destructive" }),
  });

  // Adding someone sends an invitation: they join once they accept. Nobody can
  // be put on a team - and gain visibility into it - without agreeing.
  const invite = useMutation({
    mutationFn: ({ identifier, role }: { identifier: string; role: string }) =>
      apiClient.addTeamMember(id!, identifier, role),
    onSuccess: () => {
      refreshTeam();
      setInviteOpen(false);
      setInviteIdentifier("");
      setInviteRole("member");
      toast({ title: "Invitation sent", description: "They'll join the team once they accept." });
    },
    onError: (error: any) =>
      toast({ title: "Couldn't send invitation", description: error.message, variant: "destructive" }),
  });

  const unassign = useMutation({
    mutationFn: (repoId: string) => apiClient.unassignRepositoryFromTeam(id!, repoId),
    onSuccess: () => {
      refreshTeam();
      queryClient.invalidateQueries({ queryKey: queryKeys.teamRepositories(id!) });
      toast({ title: "Repository removed from the team" });
    },
    onError: (error: any) =>
      toast({ title: "Couldn't remove repository", description: error.message, variant: "destructive" }),
  });

  const deleteTeam = useMutation({
    mutationFn: () => apiClient.deleteTeam(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.teams() });
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
      toast({ title: "Team deleted" });
      navigate("/teams");
    },
    onError: (error: any) =>
      toast({ title: "Couldn't delete team", description: error.message, variant: "destructive" }),
  });

  if (teamLoading && !team) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center min-h-[80vh]" role="status">
          <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
          <p className="text-muted-foreground">Loading team</p>
        </div>
      </div>
    );
  }

  if (teamError || !team) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8 pt-24">
          <Card>
            <CardContent className="py-16 text-center">
              <Users className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
              <p className="font-medium mb-1">This team doesn't exist or you're not on it</p>
              <p className="text-muted-foreground text-sm mb-6">Teams are visible to their organization's members.</p>
              <Button variant="outline" asChild>
                <Link to="/teams">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to teams
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const submitInvite = () => {
    const identifier = inviteIdentifier.trim();
    if (!identifier) {
      toast({ title: "Enter who to invite", description: "Use their GitHub username or email.", variant: "destructive" });
      return;
    }
    invite.mutate({ identifier, role: inviteRole });
  };

  const scored = repositories.filter((r) => r.latest_analysis?.overall_score != null);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-7xl pt-24">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-8">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" className="rounded-full shrink-0" asChild>
              <Link to="/teams" aria-label="Back to teams">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="min-w-0">
              <h1 className="text-3xl font-bold truncate">{team.name}</h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-sm text-muted-foreground">
                {team.organization_id && (
                  <Link
                    to={`/organizations/${team.organization_id}`}
                    className="inline-flex items-center gap-1 hover:text-primary"
                  >
                    <Building2 className="h-4 w-4" />
                    {team.organization?.name || "Organization"}
                  </Link>
                )}
                <span>
                  {members.length} member{members.length !== 1 ? "s" : ""}, {repositories.length} repositor
                  {repositories.length !== 1 ? "ies" : "y"}
                </span>
              </div>
              {team.description && <p className="text-muted-foreground mt-2 max-w-xl">{team.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button className="gap-2" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" />
              Invite member
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 text-destructive hover:bg-destructive hover:text-destructive-foreground">
                  <Trash2 className="h-4 w-4" />
                  Delete team
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {team.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Members leave the team and its repositories are unassigned. The repositories and their analyses are
                    not deleted. This can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteTeam.mutate()}
                    disabled={deleteTeam.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteTeam.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Delete team
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        {/* Invite dialog */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invite to {team.name}</DialogTitle>
              <DialogDescription>
                They'll get an invitation in RepoIQ and join once they accept. They need a RepoIQ account.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="invite-identifier">GitHub username or email</Label>
                <Input
                  id="invite-identifier"
                  value={inviteIdentifier}
                  onChange={(e) => setInviteIdentifier(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitInvite()}
                  placeholder="octocat or octocat@example.com"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger id="invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Managers can invite and remove members.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitInvite} disabled={invite.isPending}>
                {invite.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Send invitation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AssignRepositoryDialog open={assignOpen} onOpenChange={setAssignOpen} teamId={id!} assignedIds={assignedIds} />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8" aria-busy={summaryLoading}>
          <StatCard title="Members" value={members.length} caption="On this team" icon={Users} />
          <StatCard title="Repositories" value={repositories.length} caption="Assigned to the team" icon={FolderGit2} />
          <StatCard
            title="Average score"
            value={scored.length ? <ScoreValue score={metrics?.overall_score} /> : "—"}
            caption={scored.length ? `Across ${scored.length} analyzed repositor${scored.length === 1 ? "y" : "ies"}` : "No repository analyzed yet"}
            icon={Activity}
          />
          <StatCard
            title="Open issues"
            value={metrics?.total_issues ?? 0}
            caption={
              metrics?.critical_issues
                ? `${metrics.critical_issues} critical`
                : `${metrics?.velocity ?? 0} resolved in the last 30 days`
            }
            icon={AlertTriangle}
          />
        </div>

        <Tabs defaultValue="members" className="space-y-6">
          <TabsList>
            <TabsTrigger value="members">
              <Users className="h-4 w-4 mr-2" />
              Members ({members.length})
            </TabsTrigger>
            <TabsTrigger value="repositories">
              <FolderGit2 className="h-4 w-4 mr-2" />
              Repositories ({repositories.length})
            </TabsTrigger>
            <TabsTrigger value="performance">
              <BarChart3 className="h-4 w-4 mr-2" />
              Performance
            </TabsTrigger>
          </TabsList>

          {/* Members */}
          <TabsContent value="members" className="space-y-4">
            {members.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                  <h2 className="text-lg font-semibold mb-2">Nobody's on this team yet</h2>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    Invite people to see their contributions to the team's repositories.
                  </p>
                  <Button onClick={() => setInviteOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Invite member
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {members.map((member) => (
                  <Card key={member.user_id}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-11 w-11">
                            <AvatarImage src={member.user?.avatar_url || undefined} alt="" />
                            <AvatarFallback>{initials(displayName(member))}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{displayName(member)}</p>
                            {member.user?.github_username && (
                              <p className="text-sm text-muted-foreground truncate">@{member.user.github_username}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge variant="outline" className={roleBadge[member.role] || ""}>
                            {member.role}
                          </Badge>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                aria-label={`Remove ${displayName(member)}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove {displayName(member)}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  They'll lose access to this team. You can invite them again later.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeMember.mutate(member.user_id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                      <dl className="mt-4 pt-4 border-t grid grid-cols-2 gap-2 text-center">
                        <div>
                          <dd className="text-lg font-semibold tabular-nums">{member.total_commits}</dd>
                          <dt className="text-xs text-muted-foreground">Commits, 30 days</dt>
                        </div>
                        <div>
                          <dd className="text-lg font-semibold tabular-nums">{member.total_issues_introduced}</dd>
                          <dt className="text-xs text-muted-foreground" title="Findings on lines this person last changed, in reviewed files">
                            Findings in their code
                          </dt>
                        </div>
                      </dl>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Figures count this team's repositories only, from GitHub's commit statistics and the files RepoIQ
              reviewed. They refresh after each analysis.
            </p>
          </TabsContent>

          {/* Repositories */}
          <TabsContent value="repositories" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <p className="text-muted-foreground">Repositories this team is responsible for.</p>
              <Button variant="outline" className="gap-2 shrink-0" onClick={() => setAssignOpen(true)}>
                <Plus className="h-4 w-4" />
                Assign repository
              </Button>
            </div>

            {repositories.length === 0 ? (
              <Card>
                <CardContent className="py-16 text-center">
                  <FolderGit2 className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
                  <h2 className="text-lg font-semibold mb-2">No repositories on this team</h2>
                  <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                    Assign one of your repositories to track its code health here.
                  </p>
                  <Button variant="outline" onClick={() => setAssignOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Assign repository
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {repositories.map((repo: TeamRepo) => {
                  const analysis = repo.latest_analysis;
                  const isOwner = me?.id === repo.owner_id;
                  return (
                    <Card key={repo.id}>
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="font-semibold text-lg truncate flex items-center gap-2">
                              {repo.name}
                              {repo.is_private && <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-label="Private" />}
                            </h3>
                            <p className="text-sm text-muted-foreground truncate">{repo.full_name}</p>
                          </div>
                          {isOwner && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              aria-label={`Remove ${repo.name} from the team`}
                              onClick={() => unassign.mutate(repo.id)}
                              disabled={unassign.isPending}
                            >
                              <Unlink className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        {analysis ? (
                          <dl className="mt-4 pt-4 border-t grid grid-cols-3 gap-2 text-center">
                            <div>
                              <dd className="font-semibold tabular-nums"><ScoreValue score={analysis.overall_score} /></dd>
                              <dt className="text-xs text-muted-foreground">Overall</dt>
                            </div>
                            <div>
                              <dd className="font-semibold tabular-nums"><ScoreValue score={analysis.security_score} /></dd>
                              <dt className="text-xs text-muted-foreground">Security</dt>
                            </div>
                            <div>
                              <dd className="font-semibold tabular-nums">
                                {analysis.total_issues}
                                {analysis.critical_issues > 0 && (
                                  <span className="text-xs font-normal text-destructive"> ({analysis.critical_issues} critical)</span>
                                )}
                              </dd>
                              <dt className="text-xs text-muted-foreground">Issues</dt>
                            </div>
                          </dl>
                        ) : (
                          <p className="mt-4 pt-4 border-t text-sm text-muted-foreground">
                            Not analyzed yet{isOwner ? "." : " — its owner can run an analysis."}
                          </p>
                        )}

                        {/* Repository pages are owner-only; teammates see the summary above. */}
                        {isOwner && (
                          <Button variant="outline" className="w-full mt-4" asChild>
                            <Link to={`/dashboard/${repo.id}`}>
                              Open dashboard
                              <ChevronRight className="h-4 w-4 ml-1" />
                            </Link>
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Performance */}
          <TabsContent value="performance" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Average score</CardTitle>
                  <CardDescription>Daily average across the team's analyzed repositories</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScoreTrend trends={summary?.trends ?? []} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Most active</CardTitle>
                  <CardDescription>Commits to team repositories, last 30 days</CardDescription>
                </CardHeader>
                <CardContent>
                  {contributors.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-center">
                      <GitCommit className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No commits from team members in this period.</p>
                    </div>
                  ) : (
                    <ol className="space-y-3">
                      {contributors.slice(0, 5).map((member) => (
                        <li key={member.user_id} className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={member.user?.avatar_url || undefined} alt="" />
                              <AvatarFallback>{initials(displayName(member))}</AvatarFallback>
                            </Avatar>
                            <span className="truncate">{displayName(member)}</span>
                          </div>
                          <span className="font-semibold tabular-nums">{member.total_commits}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
