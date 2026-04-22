import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  ChevronRight,
  ClipboardList,
  Loader2,
  LogIn,
  RefreshCw,
  Settings,
  Trash2,
  User as UserIcon,
} from "lucide-react";
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
  fetchCompleted,
  fetchLatestInProgress,
  formatTimestamp,
  listCompletedLocal,
  type CompletedRecord,
  type Walkthrough,
} from "@/lib/walkthrough";

export const Route = createFileRoute("/")({
  component: WelcomeScreen,
});

function formatAddress(w: Walkthrough): string {
  const street = [w.address.houseNumber, w.address.streetName].filter(Boolean).join(" ").trim();
  const full = [street, w.address.city].filter(Boolean).join(", ");
  return full || "Untitled walkthrough";
}

function WelcomeScreen() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [existing, setExisting] = useState<Walkthrough | null>(null);
  const [completed, setCompleted] = useState<Walkthrough[]>([]);
  const [completedLocal, setCompletedLocal] = useState<CompletedRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    setCompletedLocal(listCompletedLocal());
  }, []);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([fetchLatestInProgress(user.id), fetchCompleted(user.id)])
      .then(([w, done]) => {
        setExisting(w);
        setCompleted(done);
      })
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
    const target = existing.lastRoute ?? "/address";
    navigate({ to: target });
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

  // Stats: prefer DB-backed counts, fall back to local snapshot for photos.
  const completedCount = completed.length || completedLocal.length;
  const inProgressCount = existing ? 1 : 0;
  const totalPhotos = (() => {
    if (completedLocal.length > 0) {
      return completedLocal.reduce((sum, r) => sum + (r.totalPhotos ?? 0), 0);
    }
    return completed.reduce((sum, w) => {
      let n = 0;
      for (const a of Object.values(w.answers ?? {})) n += a.photos?.length ?? 0;
      return n;
    }, 0);
  })();

  if (authLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const resumeAddr = existing ? formatAddress(existing) : null;

  // Two most recent completed previews — prefer local snapshot (richer data).
  const recentPreview: { id: string; address: string; completedAt: number }[] =
    completedLocal.length > 0
      ? completedLocal.slice(0, 2).map((r) => ({
          id: r.id,
          address: r.propertyAddress || "Untitled walkthrough",
          completedAt: r.completedAt,
        }))
      : completed.slice(0, 2).map((w) => ({
          id: w.id,
          address: formatAddress(w),
          completedAt: w.completedAt ?? w.updatedAt,
        }));

  return (
    <div className="relative flex min-h-[100dvh] flex-col bg-gradient-to-b from-primary via-primary to-[oklch(0.28_0.08_260)] text-primary-foreground">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1/2 opacity-40"
        style={{
          background:
            "radial-gradient(60% 60% at 50% 0%, oklch(0.49 0.12 258 / 0.6), transparent 70%)",
        }}
      />

      <div className="relative flex justify-end gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
        {user && (
          <Link
            to="/profile"
            aria-label="Profile"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-primary-foreground ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/15"
          >
            <UserIcon className="h-5 w-5" />
          </Link>
        )}
        <Link
          to="/debug"
          aria-label="Debug"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-primary-foreground ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/15"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>

      <main className="relative flex flex-1 flex-col px-6 pb-6">
        {/* 1. Logo + name */}
        <div className="flex flex-col items-center pt-2 text-center">
          <div className="mb-3 flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
            <img src={logo} alt="PropertyWalk logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">PropertyWalk</h1>
          <p className="mt-1 max-w-sm text-sm text-primary-foreground/70">
            Professional property documentation
          </p>
        </div>

        {/* 2. Stats bar */}
        {user && (
          <div className="mx-auto mt-5 flex w-full max-w-md flex-wrap justify-center gap-2">
            <StatChip
              icon={<ClipboardList className="h-3.5 w-3.5" />}
              label="Completed"
              value={completedCount}
              onClick={() => navigate({ to: "/walkthroughs", search: { tab: "completed" } as never })}
            />
            <StatChip
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              label="In Progress"
              value={inProgressCount}
              onClick={() => navigate({ to: "/walkthroughs", search: { tab: "in-progress" } as never })}
            />
            <StatChip
              icon={<Camera className="h-3.5 w-3.5" />}
              label="Photos"
              value={totalPhotos}
              onClick={() => navigate({ to: "/walkthroughs", search: { tab: "completed" } as never })}
            />
          </div>
        )}

        {/* 3 & 4. Action buttons */}
        <div className="mx-auto mt-6 w-full max-w-md space-y-3">
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
              <button
                onClick={startNew}
                disabled={starting}
                className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-accent-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-accent/90 active:scale-[0.99] disabled:opacity-60"
              >
                {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Start New Walkthrough"}
              </button>

              {loading ? (
                <div className="flex h-14 w-full items-center justify-center rounded-2xl border border-white/15 bg-white/5">
                  <Loader2 className="h-5 w-5 animate-spin text-primary-foreground/60" />
                </div>
              ) : existing ? (
                <button
                  onClick={resume}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-left backdrop-blur transition-colors hover:bg-white/15 active:scale-[0.99]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-primary-foreground">
                      Resume: {resumeAddr}
                    </div>
                    <div className="text-xs text-primary-foreground/60">
                      Last saved {formatTimestamp(existing.updatedAt)}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-primary-foreground/70" />
                </button>
              ) : null}

              {existing && (
                <button
                  onClick={handleStartFresh}
                  disabled={starting || clearing}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent text-xs font-medium text-primary-foreground/80 transition-all hover:bg-white/5 active:scale-[0.99] disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Discard draft & start fresh
                </button>
              )}
            </>
          )}
        </div>

        {/* 5. My Walkthroughs card */}
        {user && (
          <div className="mx-auto mt-6 w-full max-w-md">
            <Link
              to="/walkthroughs"
              className="block rounded-2xl bg-card p-5 text-card-foreground shadow-[var(--shadow-elevated)] transition-transform hover:scale-[1.01] active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold">My Walkthroughs</h2>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>

              {recentPreview.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {recentPreview.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-foreground">
                          {p.address}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTimestamp(p.completedAt)}
                        </div>
                      </div>
                      <span className="ml-3 shrink-0 text-xs font-semibold text-accent">
                        View Report
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm italic text-muted-foreground">
                  No completed walkthroughs yet. Finished properties will appear here.
                </p>
              )}
            </Link>
          </div>
        )}

        <p className="mx-auto mt-auto pt-6 text-center text-[11px] text-primary-foreground/40">
          Auto-saves to your secure account
        </p>
      </main>

      <div className="pb-[max(env(safe-area-inset-bottom),1rem)]" />

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

function StatChip({
  icon,
  label,
  value,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  onClick: () => void;
}) {
  const muted = value === 0;
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 backdrop-blur transition-colors ${
        muted
          ? "bg-white/5 text-primary-foreground/50 ring-white/10 hover:bg-white/10"
          : "bg-white/15 text-primary-foreground ring-white/20 hover:bg-white/20"
      }`}
    >
      <span className={muted ? "opacity-60" : ""}>{icon}</span>
      <span className="tabular-nums">{value}</span>
      <span className="font-medium opacity-80">{label}</span>
    </button>
  );
}
