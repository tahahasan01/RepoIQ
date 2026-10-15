import { Check, Loader2, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMyInvitations, useRespondToInvitation } from "@/hooks/useNotificationQueries";
import type { TeamInvitation } from "@/lib/api";
import { describeInvitation } from "@/lib/notifications";
import { formatRelativeTime } from "@/lib/timeUtils";

/** Accept/decline with the toasts both the bell and the Teams page use. */
function useInvitationResponse() {
  const { toast } = useToast();
  const respond = useRespondToInvitation();

  const answer = (invitation: TeamInvitation, accept: boolean) =>
    respond.mutate(
      { invitation, accept },
      {
        onSuccess: () =>
          toast(
            accept
              ? {
                  title: `You joined ${invitation.team?.name ?? "the team"}`,
                  description: "It's now listed on your Teams page.",
                }
              : { title: "Invitation declined" }
          ),
        onError: (err) =>
          toast({
            title: accept ? "Couldn't accept the invitation" : "Couldn't decline the invitation",
            description: err instanceof Error ? err.message : "Something went wrong. Try again.",
            variant: "destructive",
          }),
      }
    );

  const pendingId = respond.isPending ? respond.variables?.invitation.id : undefined;
  const pendingAccept = respond.isPending ? respond.variables?.accept : undefined;
  return { answer, pendingId, pendingAccept };
}

export function InvitationList({ invitations, compact = false }: { invitations: TeamInvitation[]; compact?: boolean }) {
  const { answer, pendingId, pendingAccept } = useInvitationResponse();

  return (
    <ul className={compact ? "divide-y divide-border" : "space-y-3"}>
      {invitations.map((invitation) => {
        const busy = pendingId === invitation.id;
        return (
          <li
            key={invitation.id}
            className={compact ? "p-3" : "flex flex-wrap items-center justify-between gap-3 p-4 border rounded-lg"}
          >
            <div className="min-w-0">
              <p className="text-sm">{describeInvitation(invitation)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatRelativeTime(invitation.created_at)}</p>
            </div>
            <div className={`flex gap-2 ${compact ? "mt-2" : ""}`}>
              <Button
                size="sm"
                className="gap-1"
                onClick={() => answer(invitation, true)}
                disabled={pendingId !== undefined}
              >
                {busy && pendingAccept ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1"
                onClick={() => answer(invitation, false)}
                disabled={pendingId !== undefined}
              >
                {busy && !pendingAccept ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Decline
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Pending invitations, shown at the top of the Teams page; nothing when there are none. */
export function InvitationsBanner() {
  const { data: invitations = [] } = useMyInvitations();
  if (invitations.length === 0) return null;

  return (
    <Card className="mb-8 border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          {invitations.length === 1 ? "You have a team invitation" : `You have ${invitations.length} team invitations`}
        </CardTitle>
        <CardDescription>You join a team only when you accept. Its managers can invite you again if you decline.</CardDescription>
      </CardHeader>
      <CardContent>
        <InvitationList invitations={invitations} />
      </CardContent>
    </Card>
  );
}
