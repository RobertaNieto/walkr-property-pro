import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, LogIn, Trash2, User as UserIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
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
import { useAuth } from "@/lib/auth";
import {
  createWalkthrough,
  deleteWalkthrough,
  fetchLatestInProgress,
  formatTimestamp,
  type Walkthrough,
} from "@/lib/walkthrough";

export const Route = createFileRoute("/")({
  component: WelcomeScreen,
});

function WelcomeScreen() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [existing, setExisting] = useState<Walkthrough | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchLatestInProgress(user.id)
      .then(setExisting)
      .catch((e) => toast.error(e.message ?? "Could not load walkthroughs"))
      .finally(() => setLoading(false));
  }, [user]);

  const startNew = async () => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    setStarting(true);
    try {
      await createWalkthrough(user.id);
      navigate({ to: "/address" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not start walkthrough";
      toast.error(msg);
    } finally {
      setStarting(false);
    }
  };

  const resume = () => {
    if (!existing) return;
    console.log("[walkthrough] resuming", { id: existing.id, lastRoute: existing.lastRoute });
    navigate({ to: existing.lastRoute ?? "/address" });
  };

  const handleStartFresh = () => {
    if (existing) {
      setConfirmFresh(true);
    } else {
      void startNew();
    }
  };

  const confirmAndStartFresh = async () => {
    if (!existing) {
      setConfirmFresh(false);
      await startNew();
      return;
    }
    setClearing(true);
    try {
      await deleteWalkthrough(existing.id);
      setExisting(null);
      setConfirmFresh(false);
      await startNew();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not clear walkthrough";
      toast.error(msg);
    } finally {
      setClearing(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-gradient-to-b from-primary via-primary to-[oklch(0.28_0.08_260)] text-primary-foreground">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 opacity-40"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, oklch(0.49 0.12 258 / 0.6), transparent 70%)",
        }}
      />

      {user && (
        <div className="relative flex justify-end px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <Link
            to="/profile"
            aria-label="Profile"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-primary-foreground ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/15"
          >
            <UserIcon className="h-5 w-5" />
          </Link>
        </div>
      )}

      <main className="relative flex flex-1 flex-col items-center justify-center px-6 pb-8">
        <div className="flex flex-col items-center text-center">
          <div className="mb-6 flex h-48 w-48 items-center justify-center sm:h-64 sm:w-64">
            <img src={logo} alt="PropertyWalk logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">PropertyWalk</h1>
          <p className="mt-3 max-w-sm text-base text-primary-foreground/70">
            Professional property documentation
          </p>
        </div>
      </main>

      <footer className="relative px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        <div className="mx-auto w-full max-w-md space-y-3">
          {!user ? (
            <Link
              to="/auth"
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-accent text-base font-semibold text-accent-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-accent/90 active:scale-[0.99]"
            >
              <LogIn className="h-5 w-5" />
              Sign in to get started
            </Link>
          ) : (
            <>
              {loading ? (
                <div className="flex h-14 w-full items-center justify-center rounded-2xl border border-white/15 bg-white/5">
                  <Loader2 className="h-5 w-5 animate-spin text-primary-foreground/60" />
                </div>
              ) : existing ? (
                <button
                  onClick={resume}
                  className="inline-flex h-14 w-full flex-col items-center justify-center rounded-2xl bg-accent text-sm font-semibold text-accent-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-accent/90 active:scale-[0.99]"
                >
                  <span className="text-base">Resume Previous Walkthrough</span>
                  <span className="text-xs font-normal text-accent-foreground/70">
                    Last saved {formatTimestamp(existing.updatedAt)}
                  </span>
                </button>
              ) : (
                <button
                  onClick={startNew}
                  disabled={starting}
                  className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-accent-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-accent/90 active:scale-[0.99] disabled:opacity-60"
                >
                  {starting ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    "Start New Walkthrough"
                  )}
                </button>
              )}

              <button
                onClick={handleStartFresh}
                disabled={starting || clearing}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 text-sm font-semibold text-primary-foreground backdrop-blur transition-all hover:bg-white/10 active:scale-[0.99] disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                Start Fresh
              </button>
            </>
          )}

          <p className="pt-4 text-center text-[11px] text-primary-foreground/40">
            Auto-saves to your secure account
          </p>
        </div>
      </footer>

      <AlertDialog open={confirmFresh} onOpenChange={setConfirmFresh}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard saved walkthrough?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your in-progress walkthrough, including all answers and
              photos. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmAndStartFresh();
              }}
              disabled={clearing}
              className="bg-critical text-critical-foreground hover:bg-critical/90"
            >
              {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Discard & start fresh"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
