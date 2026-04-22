import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, CloudUpload, Eye, Image as ImageIcon, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
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
  fetchLatestInProgress,
  formatTimestamp,
  listCompletedLocal,
  removeCompletedLocal,
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
  const [activeTab, setActiveTab] = useState<"in-progress" | "completed">(tab);
  const [inProgress, setInProgress] = useState<Walkthrough | null>(null);
  const [completed, setCompleted] = useState<CompletedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "draft"; id: string; label: string }
    | { kind: "completed"; id: string; label: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setActiveTab(tab);
  }, [tab]);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [draft] = await Promise.all([fetchLatestInProgress(user.id)]);
      setInProgress(draft);
      setCompleted(listCompletedLocal());
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not load walkthroughs";
      toast.error(msg);
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
    try {
      if (pendingDelete.kind === "draft") {
        await deleteWalkthrough(pendingDelete.id);
        setInProgress(null);
      } else {
        removeCompletedLocal(pendingDelete.id);
        setCompleted((prev) => prev.filter((r) => r.id !== pendingDelete.id));
      }
      toast.success("Deleted");
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
              In progress
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
            ) : inProgress ? (
              <DraftCard
                walk={inProgress}
                onResume={() => navigate({ to: inProgress.lastRoute ?? "/address" })}
                onDelete={() =>
                  setPendingDelete({
                    kind: "draft",
                    id: inProgress.id,
                    label:
                      [inProgress.address.houseNumber, inProgress.address.streetName]
                        .filter(Boolean)
                        .join(" ") || "this draft",
                  })
                }
              />
            ) : (
              <EmptyState
                title="No drafts yet"
                description="Start a new walkthrough from the home screen and it'll show up here."
              />
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
                  onDelete={() =>
                    setPendingDelete({
                      kind: "completed",
                      id: c.id,
                      label: c.propertyAddress || "this walkthrough",
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
            <AlertDialogTitle>Delete walkthrough?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
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
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
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
}: {
  walk: Walkthrough;
  onResume: () => void;
  onDelete: () => void;
}) {
  const addr =
    [walk.address.houseNumber, walk.address.streetName].filter(Boolean).join(" ") ||
    "Untitled walkthrough";
  const pct = completionPercent(walk);
  return (
    <SwipeRow onDelete={onDelete}>
      <button
        onClick={onResume}
        className="flex w-full items-center justify-between gap-3 bg-card p-4 text-left transition-colors hover:bg-secondary"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-foreground">{addr}</p>
          {walk.address.city && (
            <p className="truncate text-xs text-muted-foreground">{walk.address.city}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Last saved {formatTimestamp(walk.updatedAt)}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, pct)}%` }} />
            </div>
            <span className="text-[11px] font-semibold text-muted-foreground">{pct}%</span>
          </div>
        </div>
      </button>
    </SwipeRow>
  );
}

function CompletedCard({
  record,
  onDelete,
}: {
  record: CompletedRecord;
  onDelete: () => void;
}) {
  return (
    <SwipeRow onDelete={onDelete}>
      <div className="space-y-3 bg-card p-4">
        <div>
          <p className="text-base font-bold text-foreground">
            {record.propertyAddress || "Untitled walkthrough"}
          </p>
          <p className="text-xs text-muted-foreground">
            Completed {formatTimestamp(record.completedAt)}
          </p>
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

        <div className="flex gap-2 pt-1">
          <Link
            to="/review/$id"
            params={{ id: record.id }}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Eye className="h-4 w-4" />
            View report
          </Link>
          <button
            disabled
            aria-disabled
            title="Coming in Phase 5"
            className="inline-flex h-10 flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-xl border border-border bg-muted text-sm font-semibold text-muted-foreground"
          >
            <CloudUpload className="h-4 w-4" />
            Upload to Drive
          </button>
        </div>
      </div>
    </SwipeRow>
  );
}
