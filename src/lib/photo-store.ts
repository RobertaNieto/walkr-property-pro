// ---------- IndexedDB photo store ----------
// Replaces localStorage photo bucket which has a 5MB quota that iOS Safari
// enforces strictly, causing silent write failures. IndexedDB quota is 50MB+
// on mobile Safari and effectively unlimited on Chrome.
//
// Per-user isolation: the database name is suffixed with the current user's
// id so two accounts on the same device cannot read or overwrite each other's
// captured photos. The in-memory cache is wiped on every user-scope change.

import { supabase } from "@/integrations/supabase/client";
import { getCurrentUserScope, onUserScopeChange } from "./local-scope";

const DB_NAME_BASE = "propertywalk_photos";
const STORE = "photos";
const DB_VERSION = 1;

function dbName(): string {
  return `${DB_NAME_BASE}_${getCurrentUserScope()}`;
}

// In-memory cache so thumbnails render immediately after capture without
// waiting for an async IDB read.
const memCache = new Map<string, string>();

if (typeof window !== "undefined") {
  onUserScopeChange(() => {
    // Account switched on this device — drop any cached blobs from the
    // previous user so they can never appear in the new session.
    memCache.clear();
  });
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName(), DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function savePhoto(filename: string, dataUrl: string): Promise<void> {
  // Update memory cache immediately so thumbnail renders before IDB write
  // completes.
  memCache.set(filename, dataUrl);
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(dataUrl, filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[photo-store] IDB write failed", e);
  }
}

export async function removePhoto(filename: string): Promise<void> {
  memCache.delete(filename);
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(filename);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("[photo-store] IDB delete failed", e);
  }
}

// Preload a filename from IDB into memCache so future resolvePhotoSrc calls
// return it synchronously.
export async function preloadPhoto(filename: string): Promise<string | undefined> {
  if (memCache.has(filename)) return memCache.get(filename);
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(filename);
      req.onsuccess = () => {
        const val = req.result as string | undefined;
        if (val) memCache.set(filename, val);
        resolve(val);
      };
      req.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

// Synchronous resolver — checks memory cache first, then localStorage legacy.
// Call preloadPhoto() first if you need IDB data synchronously.
export function resolvePhotoSrc(entry: string | undefined): string | undefined {
  if (!entry) return undefined;
  if (
    entry.startsWith("data:") ||
    entry.startsWith("blob:") ||
    entry.startsWith("http")
  ) {
    return entry;
  }
  // Check in-memory cache first (fast).
  if (memCache.has(entry)) return memCache.get(entry);
  // NOTE: legacy unscoped localStorage fallback removed — that bucket was
  // shared across user accounts on the same device, which leaked photos
  // between agents and admins. Anything not in the per-user IDB / memCache
  // must come from Supabase Storage.
  return undefined;
}

// Compress an image File to JPEG, max 1600px on the longest side, quality 0.75.
// Falls back to the original data URL if anything fails (e.g. HEIC in a browser
// without decoder support).
export async function compressImage(file: File): Promise<string> {
  const MAX_DIM = 1600;
  const QUALITY = 0.75;

  const readAsDataURL = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    });

  const original = await readAsDataURL(file);

  // Videos and non-images: store as-is (videos won't be compressed here).
  if (!file.type.startsWith("image/")) return original;

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image decode failed"));
      i.src = original;
    });

    let { width, height } = img;
    if (width > MAX_DIM || height > MAX_DIM) {
      const scale = MAX_DIM / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return original;
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", QUALITY);
  } catch {
    return original;
  }
}

// =================== Supabase Storage adapter ===================
// Used when an admin is editing/fixing another agent's walkthrough. Photos
// MUST never touch the admin's local IndexedDB in that mode — they would
// otherwise leak into the admin's own walkthroughs and corrupt the agent's
// data on re-upload. All reads/writes go directly to the agent's bucket
// path: walkthrough-photos/{agentId}/{walkthroughId}/{filename}.

const BUCKET = "walkthrough-photos";

function dataUrlToBlob(dataUrl: string, filename: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mimeMatch = /data:([^;]+)/.exec(meta);
  const mime = mimeMatch?.[1] || (filename.endsWith(".mp4") ? "video/mp4" : "image/jpeg");
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

export interface StorageContext {
  agentId: string;
  walkthroughId: string;
}

export async function saveStoragePhoto(
  ctx: StorageContext,
  filename: string,
  dataUrl: string,
): Promise<void> {
  const blob = dataUrlToBlob(dataUrl, filename);
  const path = `${ctx.agentId}/${ctx.walkthroughId}/${filename}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type });
  if (error) throw new Error(`Storage upload failed for ${filename}: ${error.message}`);
}

export async function removeStoragePhoto(
  ctx: StorageContext,
  filename: string,
): Promise<void> {
  const path = `${ctx.agentId}/${ctx.walkthroughId}/${filename}`;
  await supabase.storage.from(BUCKET).remove([path]);
}

export async function getStorageSignedUrl(
  ctx: StorageContext,
  filename: string,
  expiresInSec = 3600,
): Promise<string | null> {
  const path = `${ctx.agentId}/${ctx.walkthroughId}/${filename}`;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSec);
  return data?.signedUrl ?? null;
}
