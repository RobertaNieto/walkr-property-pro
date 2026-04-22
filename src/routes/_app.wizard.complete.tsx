import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, CloudUpload, Eye, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { completeWalkthrough, submitWalkthrough } from "@/lib/walkthrough";

export const Route = createFileRoute("/_app/wizard/complete")({
  component: CompleteScreen,
});

function CompleteScreen() {
  const navigate = useNavigate();
  const [walkId, setWalkId] = useState<string | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Mark complete in DB and snapshot to local "completed" list.
  // We DO NOT clear the active draft here — only after Submit-to-Drive or
  // explicit "Start Fresh" so the review screen always has data to load.
  useEffect(() => {
    void completeWalkthrough().then((w) => {
      if (w) setWalkId(w.id);
    });
  }, []);

  const handleStartFresh = async () => {
    setClearing(true);
    try {
      await submitWalkthrough(); // clears active draft cache
    } finally {
      setClearing(false);
      setConfirmFresh(false);
      navigate({ to: "/" });
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="h-10 w-10 text-success" />
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
        Walkthrough complete
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        Your answers and photos are saved. Review the report below or upload it to Google Drive
        when you're ready.
      </p>

      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        {walkId && (
          <Link
            to="/review/$id"
            params={{ id: walkId }}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary/90"
          >
            <Eye className="h-5 w-5" />
            Review walkthrough
          </Link>
        )}

        <button
          disabled
          aria-disabled
          title="Coming in Phase 5"
          className="inline-flex h-12 cursor-not-allowed items-center justify-center gap-2 rounded-2xl border border-border bg-muted px-6 text-sm font-semibold text-muted-foreground"
        >
          <CloudUpload className="h-4 w-4" />
          Submit to Google Drive (coming soon)
        </button>

        <Link
          to="/"
          className="inline-flex h-12 items-center justify-center rounded-2xl border border-border bg-card px-6 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
        >
          Back to Home
        </Link>

        <button
          onClick={() => setConfirmFresh(true)}
          className="inline-flex h-11 items-center justify-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <Trash2 className="h-4 w-4" />
          Start fresh & clear from device
        </button>
      </div>

      <AlertDialog open={confirmFresh} onOpenChange={setConfirmFresh}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear walkthrough from device?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the lockbox code and active draft from this device. The completed
              report will still be available in My Walkthroughs &gt; Completed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleStartFresh();
              }}
              disabled={clearing}
              className="bg-critical text-critical-foreground hover:bg-critical/90"
            >
              Clear & go home
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
