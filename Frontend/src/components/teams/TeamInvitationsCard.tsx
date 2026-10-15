import { Clock, Loader2, Undo2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { isAccessDenied, useRevokeInvitation, useTeamInvitations } from "@/hooks/useNotificationQueries";
import type { TeamInvitation } from "@/lib/api";
import { formatRelativeTime } from "@/lib/timeUtils";

function inviteeName(invitation: TeamInvitation): string {
  const person = invitation.invitee;
  return person?.full_name || (person?.github_username ? `@${person.github_username}` : "Invited user");
}

/**
 * The team's pending invitations, for the people who may manage its members.
 * Everyone else gets a 403 from the backend, and the card is simply not shown.
 */
export function TeamInvitationsCard({ teamId }: { teamId: string }) {
  const { toast } = useToast();
  const { data: invitations = [], error, isLoading } = useTeamInvitations(teamId);
  const revoke = useRevokeInvitation(teamId);

  if (isLoading || isAccessDenied(error)) return null;

  if (error) {
    return (
      <p className="text-sm text-muted-foreground" role="alert">
        Couldn't load pending invitations. {error instanceof Error ? error.message : ""}
      </p>
    );
  }

  if (invitations.length === 0) return null;

  const revokeInvitation = (invitation: TeamInvitation) =>
    revoke.mutate(invitation.id, {
      onSuccess: () =>
        toast({
          title: "Invitation withdrawn",
          description: `${inviteeName(invitation)} can no longer accept it. You can invite them again later.`,
        }),
      onError: (err) =>
        toast({
          title: "Couldn't withdraw the invitation",
          description: err instanceof Error ? err.message : "Try again.",
          variant: "destructive",
        }),
    });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          Pending invitations ({invitations.length})
        </CardTitle>
        <CardDescription>They join the team once they accept.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {invitations.map((invitation) => {
            const name = inviteeName(invitation);
            const busy = revoke.isPending && revoke.variables === invitation.id;
            return (
              <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={invitation.invitee?.avatar_url || undefined} alt="" />
                    <AvatarFallback>{name.replace("@", "").slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium truncate">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      Invited {formatRelativeTime(invitation.created_at)}
                      {invitation.inviter?.full_name ? ` by ${invitation.inviter.full_name}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{invitation.role}</Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-muted-foreground hover:text-destructive"
                    onClick={() => revokeInvitation(invitation)}
                    disabled={revoke.isPending}
                    aria-label={`Revoke the invitation for ${name}`}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                    Revoke
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
