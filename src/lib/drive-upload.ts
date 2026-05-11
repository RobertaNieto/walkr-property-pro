// Client-side Google Drive upload helper.
// Two-phase flow:
//   Phase 1 ("photos"): stage every image to Supabase Storage, then ask the
//     edge function to push them all to Drive Photos/ + generate SUMMARY.pdf.
//   Phase 2 ("videos"): one edge-function call per video, sequentially, so
//     each request stays well under the per-call timeout.
// The walkthrough flips to upload_status = "confirmed" only after both
// phases complete (or after Phase 1 if there are no videos).

import { supabase } from "@/integrations/supabase/client";
import { preloadPhoto } from "@/lib/photo-store";
import { findQuestionForFilename, type MissingPhotoLocation } from "@/lib/missing-photo";
import type { Walkthrough } from "@/lib/walkthrough";

const BUCKET = "walkthrough-photos";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface UploadProgress {
  phase: "staging" | "drive" | "videos" | "done";
  current: number;
  total: number;
  message: string;
}

export interface UploadResult {
  success: boolean;
  driveFolderUrl?: string;
  /** Filenames of videos that still need a Phase 2 upload (Phase 1 only). */
  videosPending?: string[];
  /** Final walkthrough upload_status reported by the edge function. */
  status?: "photos_complete" | "confirmed";
  error?: string;
  /** Set when the upload failed because a photo is missing from local storage. */
  missingPhoto?: MissingPhotoLocation;
}

interface UploadOptions {
  mode?: "initial" | "reupload";
  targetUserId?: string;
  isAdmin?: boolean;
}

class MissingLocalPhotoError extends Error {
  constructor(public filename: string) {
    super(`MISSING_LOCAL_PHOTO:${filename}`);
    this.name = "MissingLocalPhotoError";
  }
}

const isVideoName = (n: string) => /\.(mp4|mov)$/i.test(n);

function dataUrlToBlob(dataUrl: string, filename: string): Blob {
  const comma = dataUrl.indexOf(",");
  if (comma === -1 || !dataUrl.startsWith("data:")) {
    throw new Error(`Could not read ${filename}: local file data is invalid`);
  }
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? "application/octet-stream";
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch {
    throw new Error(`Could not prepare ${filename}: local file data is corrupted`);
  }
}

function collectMediaNames(walk: Walkthrough): string[] {
  const names = new Set<string>();
  for (const ans of Object.values(walk.answers ?? {})) {
    (ans.photoNames ?? []).forEach((n) => n && names.add(n));
    (ans.poorPhotoNames ?? []).forEach((n) => n && names.add(n));
  }
  return Array.from(names);
}

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : String(error);
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      const body = await context.clone().json();
      return body.details ?? body.error ?? body.message ?? fallback;
    } catch {
      try {
        const text = await context.clone().text();
        return text || fallback;
      } catch {
        return fallback;
      }
    }
  }
  return fallback;
}

async function validateOwnership(walk: Walkthrough, userId: string, options?: UploadOptions): Promise<void> {
  if (!userId) throw new Error("You must be signed in before uploading to Drive");
  if (!walk?.id || !UUID_RE.test(walk.id)) {
    throw new Error("Invalid walkthroughId: the selected walkthrough could not be uploaded");
  }
  const { data: existingWalk, error: walkErr } = await supabase
    .from("walkthroughs")
    .select("id,user_id")
    .eq("id", walk.id)
    .maybeSingle();
  if (walkErr) throw new Error(`Could not validate walkthroughId: ${walkErr.message}`);
  if (!existingWalk) throw new Error(`Walkthrough ${walk.id} was not found in the database`);
  if (existingWalk.user_id !== userId && !options?.isAdmin) {
    throw new Error("This walkthrough belongs to a different signed-in user");
  }
}

async function stageFile(
  fname: string,
  walkId: string,
  stagingUserId: string,
): Promise<void> {
  const dataUrl = await preloadPhoto(fname);
  if (!dataUrl) {
    throw new MissingLocalPhotoError(fname);
  }
  const blob = dataUrlToBlob(dataUrl, fname);
  const path = `${stagingUserId}/${walkId}/${fname}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw new Error(`Stage failed for ${fname}: ${error.message}`);
}

function buildMissingPhotoFailure(walk: Walkthrough, e: MissingLocalPhotoError): UploadResult {
  const loc = findQuestionForFilename(walk, e.filename);
  const sectionName = loc?.sectionName ?? "the relevant";
  const message = `Photo ${e.filename} needs to be reattached. Go to the ${sectionName} section and re-add this photo from your camera roll, then retry upload.`;
  return {
    success: false,
    error: message,
    missingPhoto: loc ?? {
      filename: e.filename,
      questionId: "",
      questionLabel: e.filename,
      sectionIndex: 0,
      sectionName: "",
    },
  };
}

// =================== PHASE 1: photos + SUMMARY.pdf ===================

export async function uploadPhotosPhase(
  walk: Walkthrough,
  userId: string,
  onProgress?: (p: UploadProgress) => void,
  options?: UploadOptions,
): Promise<UploadResult> {
  try {
    await validateOwnership(walk, userId, options);
    const stagingUserId = options?.targetUserId ?? userId;

    const allNames = collectMediaNames(walk);
    const photoNames = allNames.filter((n) => !isVideoName(n));
    const total = photoNames.length;
    console.log("[drive-upload] phase=photos starting", { walkthroughId: walk.id, total });

    // Stage photos to Supabase Storage (skipped for admin re-uploads — files
    // already live in Storage from the agent's session).
    if (options?.isAdmin) {
      onProgress?.({ phase: "staging", current: total, total, message: "Reading photos from cloud storage..." });
    } else {
      for (let i = 0; i < photoNames.length; i++) {
        const fname = photoNames[i];
        onProgress?.({ phase: "staging", current: i, total, message: `Preparing photos... ${i + 1} of ${total}` });
        await stageFile(fname, walk.id, stagingUserId);
      }
    }

    onProgress?.({ phase: "drive", current: total, total, message: "Uploading photos & report to Google Drive..." });
    const { data, error } = await supabase.functions.invoke("upload-to-drive", {
      body: { walkthroughId: walk.id, mode: options?.mode ?? "initial", phase: "photos" },
    });
    if (error) throw new Error(await getFunctionErrorMessage(error));
    if (!data?.success) throw new Error(data?.error ?? "Upload failed");

    const videosPending = (data.videos as string[] | undefined) ?? [];
    onProgress?.({
      phase: "done",
      current: total,
      total,
      message: videosPending.length > 0 ? "Photos & report uploaded" : "Upload complete",
    });
    return {
      success: true,
      driveFolderUrl: data.driveFolderUrl,
      videosPending,
      status: data.status,
    };
  } catch (e) {
    if (e instanceof MissingLocalPhotoError) return buildMissingPhotoFailure(walk, e);
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// =================== PHASE 2: videos (one at a time) ===================

export async function uploadVideosPhase(
  walk: Walkthrough,
  userId: string,
  onProgress?: (p: UploadProgress) => void,
  options?: UploadOptions,
): Promise<UploadResult> {
  try {
    await validateOwnership(walk, userId, options);
    const stagingUserId = options?.targetUserId ?? userId;

    const videos = collectMediaNames(walk).filter(isVideoName);
    const total = videos.length;
    console.log("[drive-upload] phase=videos starting", { walkthroughId: walk.id, total });

    if (total === 0) {
      onProgress?.({ phase: "done", current: 0, total: 0, message: "No videos to upload" });
      return { success: true, status: "confirmed" };
    }

    let driveFolderUrl: string | undefined;
    for (let i = 0; i < videos.length; i++) {
      const fname = videos[i];
      const isFirst = i === 0;
      const isLast = i === videos.length - 1;

      // Stage the single video first (admins skip — already in Storage).
      if (!options?.isAdmin) {
        onProgress?.({
          phase: "staging",
          current: i,
          total,
          message: `Preparing ${fname}... ${i + 1} of ${total}`,
        });
        await stageFile(fname, walk.id, stagingUserId);
      }

      onProgress?.({
        phase: "videos",
        current: i,
        total,
        message: `Uploading ${fname}... ${i + 1} of ${total}`,
      });
      const { data, error } = await supabase.functions.invoke("upload-to-drive", {
        body: {
          walkthroughId: walk.id,
          mode: options?.mode ?? "initial",
          phase: "videos",
          videoFilename: fname,
          // First video of a re-upload run purges the Videos folder so we
          // don't end up with old + new videos side by side.
          purgeFirst: isFirst && options?.mode === "reupload",
          // Only the last video flips upload_status to "confirmed".
          markComplete: isLast,
        },
      });
      if (error) throw new Error(await getFunctionErrorMessage(error));
      if (!data?.success) throw new Error(data?.error ?? "Video upload failed");
      driveFolderUrl = data.driveFolderUrl ?? driveFolderUrl;
    }

    onProgress?.({ phase: "done", current: total, total, message: "Videos uploaded" });
    return { success: true, driveFolderUrl, status: "confirmed" };
  } catch (e) {
    if (e instanceof MissingLocalPhotoError) return buildMissingPhotoFailure(walk, e);
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// =================== Retry wrappers ===================

async function withRetry(
  run: () => Promise<UploadResult>,
  maxAttempts: number,
): Promise<UploadResult> {
  let lastResult: UploadResult = { success: false, error: "Unknown error" };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await run();
    if (res.success) return res;
    lastResult = res;
    console.warn(`[upload] attempt ${attempt} failed: ${res.error ?? "unknown"}`);
    // No point retrying — the file isn't on this device.
    if (res.missingPhoto) return res;
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  return lastResult;
}

export function uploadPhotosWithRetry(
  walk: Walkthrough,
  userId: string,
  onProgress?: (p: UploadProgress) => void,
  maxAttempts = 3,
  options?: UploadOptions,
): Promise<UploadResult> {
  return withRetry(() => uploadPhotosPhase(walk, userId, onProgress, options), maxAttempts);
}

export function uploadVideosWithRetry(
  walk: Walkthrough,
  userId: string,
  onProgress?: (p: UploadProgress) => void,
  maxAttempts = 3,
  options?: UploadOptions,
): Promise<UploadResult> {
  return withRetry(() => uploadVideosPhase(walk, userId, onProgress, options), maxAttempts);
}

// =================== Backwards-compatible combined flow ===================
// Runs Phase 1 then Phase 2 sequentially, returning the final result.
// Existing callers that just want "do the whole upload" keep working.

export async function uploadWithRetry(
  walk: Walkthrough,
  userId: string,
  onProgress?: (p: UploadProgress) => void,
  maxAttempts = 3,
  options?: UploadOptions,
): Promise<UploadResult> {
  const phase1 = await uploadPhotosWithRetry(walk, userId, onProgress, maxAttempts, options);
  if (!phase1.success) return phase1;
  if ((phase1.videosPending?.length ?? 0) === 0) return phase1;
  const phase2 = await uploadVideosWithRetry(walk, userId, onProgress, maxAttempts, options);
  if (!phase2.success) return { ...phase2, driveFolderUrl: phase1.driveFolderUrl };
  return {
    success: true,
    driveFolderUrl: phase2.driveFolderUrl ?? phase1.driveFolderUrl,
    status: "confirmed",
  };
}

export async function uploadWalkthroughToDrive(
  walk: Walkthrough,
  userId: string,
  onProgress?: (p: UploadProgress) => void,
  options?: UploadOptions,
): Promise<UploadResult> {
  return uploadWithRetry(walk, userId, onProgress, 1, options);
}
