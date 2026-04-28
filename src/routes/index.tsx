import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Camera,
  ChevronRight,
  ClipboardList,
  Eye,
  Loader2,
  LogIn,
  PlayCircle,
  RefreshCw,
  Shield,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import logo from "@/assets/logo.png";
import { UserAvatar } from "@/components/UserAvatar";
import { useMyProfile } from "@/hooks/use-my-profile";
import { useAuth } from "@/lib/auth";
import {
  createWalkthrough,
  fetchAllInProgress,
  fetchCompleted,
  formatTimestamp,
  resumeWalkthrough,
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

type WalkStatus = "in-progress" | "completed" | "uploaded";

function statusOf(w: Walkthrough): WalkStatus {
  if (!w.completedAt) return "in-progress";
  if (w.uploadStatus === "confirmed") return "uploaded";
  return "completed";
}

function StatusBadge({ status }: { status: WalkStatus }) {
  const styles: Record<WalkStatus, string> = {
    "in-progress": "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 ring-yellow-500/30",
    completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30",
    uploaded: "bg-blue-500/15 text-blue-700 dark:text-blue-400 ring-blue-500/30",
  };
  const labels: Record<WalkStatus, string> = {
    "in-progress": "In Progress",
    completed: "Completed",
    uploaded: "Uploaded",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${styles[status]}`}
    >
      {labels[status]}
    </span>
  );
}

function WelcomeScreen() {
  const navigate = useNavigate();
  const { user, loading: authLoading, isAdmin } = useAuth();
  const [inProgress, setInProgress] = useState<Walkthrough[]>([]);
  const [completed, setCompleted] = useState<Walkthrough[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([fetchAllInProgress(user.id), fetchCompleted(user.id)])
      .then(([drafts, done]) => {
        setInProgress(drafts);
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

  const handleContinue = async (w: Walkthrough) => {
    setResumingId(w.id);
    try {
      await resumeWalkthrough(w.id);
      navigate({ to: w.lastRoute ?? "/address" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not resume walkthrough";
      toast.error(msg);
    } finally {
      setResumingId(null);
    }
  };

  // Combined list, in-progress first then completed (each newest-first).
  const allWalks: Walkthrough[] = [
    ...inProgress,
    ...completed,
  ];

  const totalPhotos = [...inProgress, ...completed].reduce((sum, w) => {
    let n = 0;
    for (const a of Object.values(w.answers ?? {})) n += a.photos?.length ?? 0;
    return sum + n;
  }, 0);

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

      <div className="relative flex justify-end gap-2 px-4 pt-[max(env(safe-area-inset-top),0.75rem)]">
        {user && (
          <>
            {isAdmin && (
              <Link
                to="/admin"
                aria-label="Admin Panel"
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-white/10 px-3 text-sm font-semibold text-primary-foreground ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/15"
              >
                <Shield className="h-4 w-4" />
                Admin
              </Link>
            )}
            <Link
              to="/profile"
              aria-label="Profile"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-primary-foreground ring-1 ring-white/15 backdrop-blur transition-colors hover:bg-white/15"
            >
              <UserIcon className="h-5 w-5" />
            </Link>
          </>
        )}
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
              value={completed.length}
              onClick={() =>
                navigate({ to: "/walkthroughs", search: { tab: "completed" } as never })
              }
            />
            <StatChip
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              label="In Progress"
              value={inProgress.length}
              onClick={() =>
                navigate({ to: "/walkthroughs", search: { tab: "in-progress" } as never })
              }
            />
            <StatChip
              icon={<Camera className="h-3.5 w-3.5" />}
              label="Photos"
              value={totalPhotos}
              onClick={() =>
                navigate({ to: "/walkthroughs", search: { tab: "completed" } as never })
              }
            />
          </div>
        )}

        {/* 3. Start New — always starts fresh */}
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
            <button
              onClick={startNew}
              disabled={starting}
              className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-accent text-base font-semibold text-accent-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-accent/90 active:scale-[0.99] disabled:opacity-60"
            >
              {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Start New Walkthrough"}
            </button>
          )}
        </div>

        {/* 4. My Walkthroughs — all walks, in-progress + completed */}
        {user && (
          <div className="mx-auto mt-6 w-full max-w-md">
            <div className="rounded-2xl bg-card p-5 text-card-foreground shadow-[var(--shadow-elevated)]">
              <div
                onClick={() =>
                  navigate({
                    to: "/walkthroughs",
                    search: {
                      tab: inProgress.length > 0 ? "in-progress" : "completed",
                    } as never,
                  })
                }
                className="flex cursor-pointer items-center justify-between"
              >
                <h2 className="text-base font-bold">My Walkthroughs</h2>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>

              {loading ? (
                <div className="mt-3 flex h-16 items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : allWalks.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {allWalks.slice(0, 5).map((w) => {
                    const status = statusOf(w);
                    const isInProgress = status === "in-progress";
                    return (
                      <li
                        key={w.id}
                        className="rounded-xl bg-muted/60 px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold text-foreground">
                              {formatAddress(w)}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2">
                              <StatusBadge status={status} />
                              <span className="text-xs text-muted-foreground">
                                {isInProgress
                                  ? `Saved ${formatTimestamp(w.updatedAt)}`
                                  : `Completed ${formatTimestamp(w.completedAt ?? w.updatedAt)}`}
                              </span>
                            </div>
                          </div>
                          {isInProgress ? (
                            <button
                              onClick={() => void handleContinue(w)}
                              disabled={resumingId === w.id}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-60"
                            >
                              {resumingId === w.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <>
                                  <PlayCircle className="h-3.5 w-3.5" />
                                  Continue
                                </>
                              )}
                            </button>
                          ) : (
                            <Link
                              to="/review/$id"
                              params={{ id: w.id }}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              View Report
                            </Link>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="mt-3 text-sm italic text-muted-foreground">
                  No walkthroughs yet. Tap "Start New Walkthrough" to begin.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mx-auto mt-auto pt-6 text-center space-y-1">
          <p className="text-[11px] text-primary-foreground/40">
            Auto-saves to your secure account
          </p>
          <p className="text-[11px] text-primary-foreground/40">
            © 2026 WeConnect. All rights reserved.
          </p>
        </div>
      </main>

      <div className="pb-[max(env(safe-area-inset-bottom),1rem)]" />
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
