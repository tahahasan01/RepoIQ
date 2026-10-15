import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import apiClient, { signOut } from "@/lib/api";

/** What the user must type to enable the delete button. */
export const DELETE_ACCOUNT_CONFIRMATION = "delete my account";

/**
 * Permanently delete the account (DELETE /users/me), then sign out.
 *
 * Deleting is irreversible, so the button stays disabled until the user types
 * the confirmation phrase, and the dialog stays open while the request runs so
 * a failure is reported in place rather than lost.
 */
export function DeleteAccountDialog({ size = "default" }: { size?: "default" | "sm" }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmation.trim().toLowerCase() === DELETE_ACCOUNT_CONFIRMATION;

  const handleOpenChange = (next: boolean) => {
    if (deleting) return;
    setOpen(next);
    if (!next) {
      setConfirmation("");
      setError(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmed) return;
    setDeleting(true);
    setError(null);
    try {
      await apiClient.deleteAccount();
    } catch (err) {
      setDeleting(false);
      setError(err instanceof Error ? err.message : "Failed to delete your account. Please try again.");
      return;
    }
    // The account and its sessions no longer exist server-side, so there is
    // nothing to revoke; just clear this device and leave.
    await signOut({ revokeSession: false, redirectTo: "/" });
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size={size} className="gap-2">
          <Trash2 className="h-4 w-4" /> Delete Account
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your RepoIQ account and its data. It cannot be undone. Your
            GitHub account is not affected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-account-confirmation">
            Type <span className="font-mono font-semibold">{DELETE_ACCOUNT_CONFIRMATION}</span> to confirm
          </Label>
          <Input
            id="delete-account-confirmation"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
            disabled={deleting}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={handleDelete} disabled={!confirmed || deleting} className="gap-2">
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete account permanently
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default DeleteAccountDialog;
