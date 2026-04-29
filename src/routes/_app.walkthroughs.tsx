import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CheckCircle2, CloudUpload, Eye, Image as ImageIcon, Loader2, PlayCircle, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { uploadWithRetry, type UploadProgress } from "@/lib/drive-upload";
import { fetchById } from "@/lib/walkthrough";
import { toast } from "sonner";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import {
  deleteWalkthrough,
  fetchAllInProgress,
  fetchCompleted,
  formatTimestamp,
  listCompletedLocal,
  removeCompletedLocal,
  resumeWalkthrough,
  type CompletedRecord,
  type Walkthrough,
} from "@/lib/walkthrough";

export const Route = createFileRoute("/_app/walkthroughs")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "completed" ? "completed" : "in-progress",
  }),
  component: WalkthroughsScreen,
});

const TOTAL_QUESTIONS = 18;

function completionPercent(w: Walkthrough): number {
  const answered = Object.values(w.answers ?? {}).filter(
    (a) => (a.text && a.text.trim()) || a.rating !== undefined || (a.photos && a.photos.length > 0)
  ).length;
  return Math.min(100, Math.round((answered / TOTAL_QUESTIONS) * 100));
}

function WalkthroughsScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { tab } = Route.useSearch();
  const resolvedTab: "in-progress" | "completed" = tab === "completed" ? "completed" : "in-progress";
  const [activeTab, setActiveTab] = useState<"in-progress" | "completed">(resolvedTab);
  const [inProgress, setInProgress] = useState<Walkthrough[]>([]);
  const [completed, setCompleted] = useState<CompletedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "draft"; id: string; label: string; uploaded: boolean }
    | { kind: "completed"; id: string; label: string; uploaded: boolean }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setActiveTab(resolvedTab);
  }, [resolvedTab]);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);

    // Load local data immediately so UI isn't blank while Supabase loads
    const local = listCompletedLocal();
    setCompleted(local);

    try {
      const [drafts, dbCompleted] = await Promise.all([
        fetchAllInProgress(user.id),
        fetchCompleted(user.id),
      ]);

      setInProgress(drafts);

      // Merge DB + local completed records.
      // DB is source of truth. Local fills gaps for records not yet flushed to DB.
      const dbIds = new Set(dbCompleted.map((w) => w.id));
      const localOnly = listCompletedLocal().filter((r) => !dbIds.has(r.id));

      const merged = [
        ...dbCompleted.map((w) => ({
          ...w,
          completedAt: w.completedAt ?? w.updatedAt,
          propertyAddress: [w.address.houseNumber, w.address.streetName, w.address.city]
            .filter(Boolean)
            .join(", "),
          totalPhotos: Object.values(w.answers ?? {}).reduce(
            (n, a) => n + (a.photos?.length ?? 0),
            0
          ),
          criticalFlags: [] as { questionId: string; notes?: string }[],
          uploadStatus: w.uploadStatus,
          driveFolderUrl: w.driveFolderUrl,
        })),
        ...localOnly,
      ] as typeof local;

      // Sort newest first
      merged.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

      setCompleted(merged);

      // Backfill local storage with DB records so future loads work offline too
      for (const w of dbCompleted) {
        const exists = listCompletedLocal().find((r) => r.id === w.id);
        if (!exists) {
          const record = {
            ...w,
            completedAt: w.completedAt ?? w.updatedAt,
            propertyAddress: [w.address.houseNumber, w.address.streetName, w.address.city]
              .filter(Boolean)
              .join(", "),
            totalPhotos: Object.values(w.answers ?? {}).reduce(
              (n, a) => n + (a.photos?.length ?? 0),
              0
            ),
            criticalFlags: [],
            uploadStatus: w.uploadStatus,
            driveFolderUrl: w.driveFolderUrl,
          };
          const existing = listCompletedLocal().filter((r) => r.id !== record.id);
          localStorage.setItem(
            "propertywalk_completed",
            JSON.stringify([record, ...existing].slice(0, 50))
          );
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load walkthroughs";
      toast.error(msg);
      // Keep showing local data if DB fails
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { id, kind } = pendingDelete;
    try {
      // Always remove from DB + local cache + IndexedDB photos.
      // deleteWalkthrough is safe to call even if the row is already gone.
      await deleteWalkthrough(id).catch((err) => {
        // If the row doesn't exist in DB (e.g. local-only completed record),
        // still proceed with local cleanup.
        console.warn("[walkthroughs] deleteWalkthrough error", err);
      });
      removeCompletedLocal(id);
      if (kind === "draft") {
        setInProgress((prev) => prev.filter((w) => w.id !== id));
      } else {
        setCompleted((prev) => prev.filter((r) => r.id !== id));
      }
      // Also remove from the other list in case a record appears in both.
      setInProgress((prev) => prev.filter((w) => w.id !== id));
      setCompleted((prev) => prev.filter((r) => r.id !== id));
      toast.success("Walkthrough deleted");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not delete";
      toast.error(msg);
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <Link
            to="/"
            aria-label="Back"
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold text-foreground">My walkthroughs</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5">
        <Tabs
          value={activeTab}
          onValueChange={(value) => {
            const next = value === "completed" ? "completed" : "in-progress";
            setActiveTab(next);
            navigate({ to: "/walkthroughs", search: { tab: next } as never, replace: true });
          }}
          className="w-full"
        >
          <TabsList className="grid h-11 w-full grid-cols-2">
            <TabsTrigger value="in-progress" className="text-sm font-semibold">
              In progress{inProgress.length > 0 ? ` (${inProgress.length})` : ""}
            </TabsTrigger>
            <TabsTrigger value="completed" className="text-sm font-semibold">
              Completed{completed.length > 0 ? ` (${completed.length})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="in-progress" className="mt-4 space-y-3">
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : inProgress.length === 0 ? (
              <EmptyState
                title="No drafts yet"
                description="Start a new walkthrough from the home screen and it'll show up here."
              />
            ) : (
              inProgress.map((w) => (
                <DraftCard
                  key={w.id}
                  walk={w}
                  resuming={resumingId === w.id}
                  onResume={async () => {
                    setResumingId(w.id);
                    try {
                      await resumeWalkthrough(w.id);
                      navigate({ to: w.lastRoute ?? "/address" });
                    } catch (e) {
                      const msg = e instanceof Error ? e.message : "Could not resume";
                      toast.error(msg);
                    } finally {
                      setResumingId(null);
                    }
                  }}
                  onDelete={() =>
                    setPendingDelete({
                      kind: "draft",
                      id: w.id,
                      label:
                        [w.address.houseNumber, w.address.streetName]
                          .filter(Boolean)
                          .join(" ") || "this draft",
                      uploaded: w.uploadStatus === "confirmed",
                    })
                  }
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="completed" className="mt-4 space-y-3">
            {loading ? (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : completed.length === 0 ? (
              <EmptyState
                title="No completed walkthroughs"
                description="When you finish a walkthrough it'll be saved here."
              />
            ) : (
              completed.map((c) => (
                <CompletedCard
                  key={c.id}
                  record={c}
                  userId={user?.id ?? null}
                  onDelete={() =>
                    setPendingDelete({
                      kind: "completed",
                      id: c.id,
                      label: c.propertyAddress || "this walkthrough",
                      uploaded:
                        (c as unknown as { uploadStatus?: string }).uploadStatus === "confirmed",
                    })
                  }
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.uploaded
                ? "Delete from PropertyWalk only?"
                : "Delete walkthrough?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.uploaded
                ? "This walkthrough has been uploaded to Drive. The Drive folder will NOT be deleted. Delete from PropertyWalk only?"
                : pendingDelete
                ? `This permanently deletes ${pendingDelete.label}. This cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
              disabled={deleting}
              className="bg-critical text-critical-foreground hover:bg-critical/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : pendingDelete?.uploaded ? "Confirm" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SwipeRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [startX, setStartX] = useState<number | null>(null);

  const handleStart = (x: number) => setStartX(x);
  const handleMove = (x: number) => {
    if (startX === null) return;
    const delta = Math.min(0, x - startX);
    setDx(Math.max(-96, delta));
  };
  const handleEnd = () => {
    setStartX(null);
    setDx((d) => (d < -56 ? -96 : 0));
  };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <button
        onClick={onDelete}
        aria-label="Delete"
        className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-critical text-critical-foreground"
      >
        <Trash2 className="h-5 w-5" />
      </button>
      <div
        style={{ transform: `translateX(${dx}px)`, transition: startX === null ? "transform 200ms" : "none" }}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
        onMouseDown={(e) => handleStart(e.clientX)}
        onMouseMove={(e) => startX !== null && handleMove(e.clientX)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
      >
        {children}
      </div>
    </div>
  );
}

function DraftCard({
  walk,
  onResume,
  onDelete,
  resuming,
}: {
  walk: Walkthrough;
  onResume: () => void;
  onDelete: () => void;
  resuming?: boolean;
}) {
  const addr =
    [walk.address.houseNumber, walk.address.streetName].filter(Boolean).join(" ") ||
    "Untitled walkthrough";
  const pct = completionPercent(walk);
  return (
    <SwipeRow onDelete={onDelete}>
      <div className="bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-yellow-500/15 px-2 py-0.5 text-[11px] font-semibold text-yellow-700 ring-1 ring-yellow-500/30 dark:text-yellow-400">
                In Progress
              </span>
            </div>
            <p className="mt-1.5 truncate text-base font-bold text-foreground">{addr}</p>
            {walk.address.city && (
              <p className="truncate text-xs text-muted-foreground">{walk.address.city}</p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              Last saved {formatTimestamp(walk.updatedAt)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${Math.max(2, pct)}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground">{pct}%</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete walkthrough"
            className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-critical/10 hover:text-critical"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={onResume}
          disabled={resuming}
          className="mt-3 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-60"
        >
          {resuming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <PlayCircle className="h-4 w-4" />
              Continue
            </>
          )}
        </button>
      </div>
    </SwipeRow>
  );
}

function CompletedCard({
  record,
  userId,
  onDelete,
}: {
  record: CompletedRecord;
  userId: string | null;
  onDelete: () => void;
}) {
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);

  const handleUpload = async () => {
    if (!userId) {
      setStatus("error");
      setError("Not signed in");
      return;
    }
    setStatus("uploading");
    setError(null);
    setDriveUrl(null);
    try {
      const walk = await fetchById(record.id);
      if (!walk) throw new Error("Walkthrough not found");
      const res = await uploadWithRetry(walk, userId, (p) => setProgress(p));
      if (res.success) {
        setStatus("success");
        setDriveUrl(res.driveFolderUrl ?? null);
      } else {
        setStatus("error");
        setError(res.error ?? "Upload failed");
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : progress?.phase === "drive"
        ? 90
        : 5;

  return (
    <SwipeRow onDelete={onDelete}>
      <div className="space-y-3 bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400">
              Completed
            </span>
            <p className="mt-1.5 truncate text-base font-bold text-foreground">
              {record.propertyAddress || "Untitled walkthrough"}
            </p>
            <p className="text-xs text-muted-foreground">
              Completed {formatTimestamp(record.completedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete walkthrough"
            className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-critical/10 hover:text-critical"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-semibold text-foreground">
            <ImageIcon className="h-3 w-3" />
            {record.totalPhotos} photo{record.totalPhotos === 1 ? "" : "s"}
          </span>
          <span
            className={
              record.criticalFlags.length > 0
                ? "inline-flex items-center gap-1 rounded-full bg-critical/10 px-2.5 py-1 font-semibold text-critical"
                : "inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-semibold text-foreground"
            }
          >
            <AlertTriangle className="h-3 w-3" />
            {record.criticalFlags.length} critical
          </span>
        </div>

        {status === "uploading" && (
          <div className="rounded-xl border border-border bg-muted/40 p-2.5">
            <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {progress?.message ?? "Starting upload..."}
            </div>
            <Progress value={pct} className="h-1.5" />
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <Link
            to="/review/$id"
            params={{ id: record.id }}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Eye className="h-4 w-4" />
            View report
          </Link>
          {status === "success" && driveUrl ? (
            <a
              href={driveUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4" />
              Uploaded ✓ View in Drive
            </a>
          ) : status === "error" ? (
            <button
              type="button"
              onClick={handleUpload}
              title={error ?? undefined}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-critical text-sm font-semibold text-critical-foreground transition-colors hover:bg-critical/90"
            >
              <AlertTriangle className="h-4 w-4" />
              Upload Failed — Retry
            </button>
          ) : (
            <button
              type="button"
              onClick={handleUpload}
              disabled={status === "uploading"}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
            >
              {status === "uploading" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudUpload className="h-4 w-4" />
              )}
              Upload to Drive
            </button>
          )}
        </div>
      </div>
    </SwipeRow>
  );
}

