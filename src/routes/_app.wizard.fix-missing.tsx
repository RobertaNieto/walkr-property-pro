import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  Film,
  Loader2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import {
  exitAdminEdit,
  getAdminEditing,
  loadActive,
  type Walkthrough,
} from "@/lib/walkthrough";
import {
  buildQuestionList,
  isQuestionAnswered,
  SECTIONS,
  type QuestionDef,
  type SkipContext,
} from "@/lib/wizard-schema";
import { uploadPhotosWithRetry, uploadVideosWithRetry, type UploadProgress } from "@/lib/drive-upload";
import type { MissingPhotoLocation } from "@/lib/missing-photo";
import { UploadErrorBanner } from "@/components/UploadErrorBanner";

export const Route = createFileRoute("/_app/wizard/fix-missing")({
  component: FixMissingScreen,
});

interface MissingItem {
  q: QuestionDef;
  kind: "photo" | "answer";
}

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: UploadProgress }
  | { kind: "photos_done"; url: string; pendingVideos: number }
  | { kind: "success"; url: string }
  | { kind: "error"; message: string; missingPhoto?: MissingPhotoLocation };

function FixMissingScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const adminEdit = useMemo(() => getAdminEditing(), [tick]);
  const w: Walkthrough | null = useMemo(() => loadActive(), [tick]);
  const [upload, setUpload] = useState<UploadState>({ kind: "idle" });

  // Light polling so the list reflects answers updated elsewhere.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1500);
    return () => clearInterval(t);
  }, []);

  const ctx: SkipContext = useMemo(
    () => ({ config: w?.config ?? {}, answers: (w?.answers ?? {}) as SkipContext["answers"] }),
    [w],
  );

  const grouped = useMemo(() => {
    if (!w) return [] as { sectionIndex: number; sectionName: string; items: MissingItem[] }[];
    const list = buildQuestionList(ctx).filter((q) => !q.renderedByCompanion);
    const bySec = new Map<number, MissingItem[]>();
    for (const q of list) {
      const ans = ctx.answers[q.id];
      if (isQuestionAnswered(q, ans)) continue;
      // Skip optional non-rating questions — they aren't "missing".
      if (!q.required && q.field !== "rating") continue;
      const kind: MissingItem["kind"] = q.field === "photo" || q.field === "video" ? "photo" : "answer";
      const arr = bySec.get(q.sectionIndex) ?? [];
      arr.push({ q, kind });
      bySec.set(q.sectionIndex, arr);
    }
    const out: { sectionIndex: number; sectionName: string; items: MissingItem[] }[] = [];
    for (const s of SECTIONS) {
      const items = bySec.get(s.index);
      if (items && items.length) out.push({ sectionIndex: s.index, sectionName: s.name, items });
    }
    return out;
  }, [w, ctx]);

  const totalMissing = grouped.reduce((n, g) => n + g.items.length, 0);
  const allClear = totalMissing === 0;

  if (!adminEdit) {
    // Only admins reach this screen via the admin panel.
    return <Navigate to="/admin" />;
  }
  if (!w) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background px-6 text-center">
        <p className="text-sm text-muted-foreground">Loading walkthrough…</p>
      </div>
    );
  }

  const goAnswer = (qid: string) => {
    navigate({ to: "/wizard/q/$qid", params: { qid } });
  };

  const handleExit = async () => {
    await exitAdminEdit();
    navigate({ to: "/admin" });
  };

  const handleUploadPhotos = async () => {
    if (!user || !w || upload.kind === "uploading") return;
    setUpload({
      kind: "uploading",
      progress: { phase: "staging", current: 0, total: 0, message: "Starting…" },
    });
    const res = await uploadPhotosWithRetry(
      w,
      user.id,
      (p) => setUpload({ kind: "uploading", progress: p }),
      3,
      { mode: "reupload", targetUserId: adminEdit.agentId, isAdmin: true },
    );
    if (!res.success || !res.driveFolderUrl) {
      setUpload({ kind: "error", message: res.error ?? "Upload failed", missingPhoto: res.missingPhoto });
      return;
    }
    const pending = res.videosPending?.length ?? 0;
    if (pending === 0) {
      setUpload({ kind: "success", url: res.driveFolderUrl });
    } else {
      setUpload({ kind: "photos_done", url: res.driveFolderUrl, pendingVideos: pending });
    }
  };

  const handleUploadVideos = async () => {
    if (!user || !w || upload.kind === "uploading") return;
    const currentUrl = upload.kind === "photos_done" ? upload.url : null;
    setUpload({
      kind: "uploading",
      progress: { phase: "staging", current: 0, total: 0, message: "Starting video upload…" },
    });
    const res = await uploadVideosWithRetry(
      w,
      user.id,
      (p) => setUpload({ kind: "uploading", progress: p }),
      3,
      { mode: "reupload", targetUserId: adminEdit.agentId, isAdmin: true },
    );
    if (res.success && (res.driveFolderUrl ?? currentUrl)) {
      setUpload({ kind: "success", url: res.driveFolderUrl ?? currentUrl! });
    } else {
      setUpload({ kind: "error", message: res.error ?? "Video upload failed", missingPhoto: res.missingPhoto });
    }
  };

  const uploading = upload.kind === "uploading";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* Admin banner */}
      <div className="sticky top-0 z-30 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-amber-900 dark:text-amber-200">
        <div className="mx-auto flex w-full max-w-2xl items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-[12px] font-semibold leading-snug">
            Editing {adminEdit.agentName}'s walkthrough
            {adminEdit.address ? ` — ${adminEdit.address}` : ""}. Changes save immediately.
          </p>
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-border bg-background">
        <div className="mx-auto w-full max-w-2xl px-4 py-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExit()}
              aria-label="Back to admin"
              className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground hover:bg-secondary"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              Admin Tools
            </p>
          </div>
          <h1 className="mt-2 flex items-center gap-2 text-xl font-bold leading-tight tracking-tight text-foreground">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Missing Items
            {adminEdit.address ? <span className="text-muted-foreground">— {adminEdit.address}</span> : null}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agent: <span className="font-semibold text-foreground">{adminEdit.agentName}</span>
            {" · "}
            {allClear ? (
              <span className="font-semibold text-emerald-600">All items complete ✓</span>
            ) : (
              <span className="font-semibold text-amber-700 dark:text-amber-400">
                {totalMissing} item{totalMissing === 1 ? "" : "s"} incomplete
              </span>
            )}
          </p>
        </div>
      </header>

      {/* Body */}
      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-5">
          {allClear ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 text-center">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
              <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                All items complete ✓
              </p>
              <p className="text-sm text-muted-foreground">
                Nothing left to fix. You can re-upload to Drive below.
              </p>
            </div>
          ) : (
            grouped.map((g) => (
              <section
                key={g.sectionIndex}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm"
              >
                <div className="border-b border-border bg-muted/40 px-4 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Section {g.sectionIndex}
                  </p>
                  <p className="text-sm font-bold text-foreground">{g.sectionName}</p>
                </div>
                <ul className="divide-y divide-border">
                  {g.items.map(({ q, kind }) => (
                    <li
                      key={q.id}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="flex min-w-0 items-start gap-2">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {q.label}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {kind === "photo" ? "Photo missing" : "Not answered"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => goAnswer(q.id)}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        {kind === "photo" ? (
                          <>
                            <Camera className="h-3.5 w-3.5" />
                            Add Photo →
                          </>
                        ) : (
                          <>Answer →</>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </main>

      {/* Footer — Upload to Drive */}
      <footer className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto w-full max-w-2xl space-y-2 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          {upload.kind === "uploading" && (
            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {upload.progress.message}
              </div>
              <Progress
                value={
                  upload.progress.total > 0
                    ? Math.round((upload.progress.current / upload.progress.total) * 100)
                    : 0
                }
              />
            </div>
          )}

          {upload.kind === "photos_done" && (
            <>
              <div className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-success px-4 text-sm font-semibold text-success-foreground">
                <CheckCircle2 className="h-4 w-4" />
                ✓ Photos &amp; Report Uploaded
              </div>
              <a
                href={upload.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-xs font-semibold text-foreground hover:bg-secondary"
              >
                View in Drive →
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          )}

          {upload.kind === "success" && (
            <>
              <div className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-success px-4 text-sm font-semibold text-success-foreground">
                <CheckCircle2 className="h-4 w-4" />
                Fully Uploaded ✓
              </div>
              <a
                href={upload.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-xs font-semibold text-foreground hover:bg-secondary"
              >
                View in Drive →
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          )}

          {upload.kind === "error" && (
            <div className="flex items-start gap-2 rounded-xl bg-critical/10 p-3 text-left text-xs text-critical">
              <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{upload.message}</span>
            </div>
          )}

          {upload.kind !== "photos_done" && upload.kind !== "success" && (
            <button
              type="button"
              onClick={() => void handleUploadPhotos()}
              disabled={!allClear || uploading}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              title={!allClear ? "Resolve all missing items first" : undefined}
            >
              <CloudUpload className="h-5 w-5" />
              {allClear
                ? "Upload Photos & Report to Drive"
                : `${totalMissing} item${totalMissing === 1 ? "" : "s"} remaining`}
            </button>
          )}

          {upload.kind === "photos_done" && (
            <button
              type="button"
              onClick={() => void handleUploadVideos()}
              disabled={uploading}
              className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-[var(--shadow-elevated)] transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Film className="h-5 w-5" />
              Upload Videos to Drive ({upload.pendingVideos})
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleExit()}
            disabled={uploading}
            className="inline-flex h-11 w-full items-center justify-center rounded-2xl border-2 border-border bg-card text-sm font-semibold text-foreground hover:bg-secondary disabled:opacity-60"
          >
            Exit Admin Edit
          </button>
        </div>
      </footer>
    </div>
  );
}
