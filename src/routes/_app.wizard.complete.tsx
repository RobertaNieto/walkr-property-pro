import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, CloudUpload, Eye, ExternalLink, Film, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { completeWalkthrough, fetchById, formatPropertyAddress, isAdminEditing, submitWalkthrough, type Walkthrough } from "@/lib/walkthrough";
import { uploadPhotosWithRetry, uploadVideosWithRetry, type UploadProgress } from "@/lib/drive-upload";
import { useAuth } from "@/lib/auth";
import { useOnlineStatus } from "@/hooks/use-online-status";

export const Route = createFileRoute("/_app/wizard/complete")({
  component: CompleteScreen,
});

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading"; progress: UploadProgress }
  | { kind: "photos_done"; url: string; pendingVideos: number }
  | { kind: "success"; url: string }
  | { kind: "error"; message: string };

function CompleteScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const online = useOnlineStatus();
  const [walk, setWalk] = useState<Walkthrough | null>(null);
  const [confirmFresh, setConfirmFresh] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [upload, setUpload] = useState<UploadState>({ kind: "idle" });
  const adminEditing = useMemo(() => isAdminEditing(), []);

  // Mark complete in DB and snapshot to local "completed" list.
  useEffect(() => {
    if (adminEditing) return;
    void completeWalkthrough().then(async (w) => {
      if (!w) return;
      setWalk(w);
      const fresh = await fetchById(w.id);
      if (fresh) {
        setWalk(fresh);
        if (fresh.uploadStatus === "confirmed" && fresh.driveFolderUrl) {
          setUpload({ kind: "success", url: fresh.driveFolderUrl });
        } else if (fresh.uploadStatus === "photos_complete" && fresh.driveFolderUrl) {
          let pending = 0;
          for (const ans of Object.values(fresh.answers ?? {})) {
            for (const n of [...(ans.photoNames ?? []), ...(ans.poorPhotoNames ?? [])]) {
              if (n && /\.(mp4|mov)$/i.test(n)) pending++;
            }
          }
          setUpload({ kind: "photos_done", url: fresh.driveFolderUrl, pendingVideos: pending });
        }
      }
    });
  }, [adminEditing]);

  if (adminEditing) {
    return <Navigate to="/wizard/menu" replace />;
  }

  const handleStartFresh = async () => {
    setClearing(true);
    try {
      await submitWalkthrough();
    } finally {
      setClearing(false);
      setConfirmFresh(false);
      navigate({ to: "/" });
    }
  };

  const handleUpload = async () => {
    if (!walk || !user || !online) return;
    setUpload({
      kind: "uploading",
      progress: { phase: "staging", current: 0, total: 0, message: "Starting..." },
    });
    const res = await uploadPhotosWithRetry(walk, user.id, (p) => {
      setUpload({ kind: "uploading", progress: p });
    });
    if (!res.success || !res.driveFolderUrl) {
      setUpload({ kind: "error", message: res.error ?? "Upload failed" });
      return;
    }
    const pending = res.videosPending?.length ?? 0;
    if (pending === 0) {
      setUpload({ kind: "success", url: res.driveFolderUrl });
    } else {
      setUpload({ kind: "photos_done", url: res.driveFolderUrl, pendingVideos: pending });
    }
  };

  const handleVideoUpload = async () => {
    if (!walk || !user || !online) return;
    const currentUrl = upload.kind === "photos_done" ? upload.url : null;
    setUpload({
      kind: "uploading",
      progress: { phase: "staging", current: 0, total: 0, message: "Starting video upload..." },
    });
    const res = await uploadVideosWithRetry(walk, user.id, (p) => {
      setUpload({ kind: "uploading", progress: p });
    });
    if (res.success && (res.driveFolderUrl ?? currentUrl)) {
      setUpload({ kind: "success", url: res.driveFolderUrl ?? currentUrl! });
    } else {
      setUpload({ kind: "error", message: res.error ?? "Video upload failed" });
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/10">
        <CheckCircle2 className="h-10 w-10 text-success" />
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
        Walkthrough complete
      </h1>
      {walk && formatPropertyAddress(walk.address) && (
        <p className="mt-2 text-sm font-semibold text-foreground">
          {formatPropertyAddress(walk.address)}
        </p>
      )}
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        Your answers and photos are saved. Upload to Google Drive when you're
        ready.
      </p>

      <div className="mt-8 flex w-full max-w-sm flex-col gap-3">
        {walk && (
          <Link
            to="/review/$id"
            params={{ id: walk.id }}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-8 text-base font-semibold text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary/90"
          >
            <Eye className="h-5 w-5" />
            Review walkthrough
          </Link>
        )}

        <UploadButton state={upload} onUpload={handleUpload} online={online} />

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

function UploadButton({
  state,
  onUpload,
  online,
}: {
  state: UploadState;
  onUpload: () => void;
  online: boolean;
}) {
  if (state.kind === "uploading") {
    const { current, total, message } = state.progress;
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {message}
        </div>
        <Progress value={pct} />
        <div className="text-xs text-muted-foreground">{pct}%</div>
      </div>
    );
  }

  if (state.kind === "success") {
    return (
      <a
        href={state.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-success px-6 text-base font-semibold text-success-foreground transition-colors hover:bg-success/90"
      >
        <CheckCircle2 className="h-5 w-5" />
        Uploaded — View in Drive
        <ExternalLink className="h-4 w-4" />
      </a>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2 rounded-xl bg-critical/10 p-3 text-left text-xs text-critical">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{state.message}</span>
        </div>
        <button
          onClick={onUpload}
          disabled={!online}
          title={!online ? "Upload available when online" : undefined}
          aria-label={!online ? "Upload available when online" : undefined}
          className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-critical px-6 text-base font-semibold text-critical-foreground transition-colors hover:bg-critical/90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-critical"
        >
          <RefreshCw className="h-5 w-5" />
          {online ? "Upload Failed — Retry" : "Offline — Retry when online"}
        </button>
      </div>
    );
  }

  const button = (
    <button
      onClick={onUpload}
      disabled={!online}
      aria-disabled={!online}
      className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-[var(--shadow-elevated)] transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-primary"
    >
      <CloudUpload className="h-5 w-5" />
      Upload to Drive
    </button>
  );

  if (!online) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* span wrapper so tooltip works on disabled button */}
            <span className="inline-block w-full" tabIndex={0}>
              {button}
            </span>
          </TooltipTrigger>
          <TooltipContent>Upload available when online</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
}
