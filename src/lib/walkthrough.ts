// Walkthrough persistence. Source of truth is Supabase (per-user, RLS-protected).
// localStorage is used only as a temporary draft cache before the user has
// authenticated, and as an in-memory mirror for fast UI updates.

import { supabase } from "@/integrations/supabase/client";

export type Rating = 1 | 2 | 3;

export interface PropertyAddress {
  houseNumber: string;
  streetName: string;
  city: string;
  zipCode: string;
  state: string;
}

export interface PreWalkConfig {
  bedrooms?: string;
  bathrooms?: string;
  garage?: string;
  pool?: "Yes" | "No";
  spa?: "Yes" | "No";
  fireplace?: "Yes" | "No";
  laundry?: string;
}

export interface WizardPhoto {
  src: string; // data URL
  filename: string; // e.g. EXTERIOR_FRONT.jpg
}

export interface WizardAnswer {
  text?: string;
  rating?: Rating;
  notes?: string;
  // Photos can be either legacy string data-URLs (older drafts) or rich
  // objects with auto-generated filenames. Stored as strings here for
  // backward compatibility with PhotoCapture; filenames are tracked on
  // a parallel object map keyed by question id.
  photos?: string[];
  photoNames?: string[]; // index-aligned with photos
  // Photos captured because the rating was 3 (Poor). Stored separately so
  // they don't intermix with regular photos and can be cleared if the
  // rating changes back to 1 or 2.
  poorPhotos?: string[];
  poorPhotoNames?: string[];
  bool?: boolean;
  choice?: string;
  choices?: string[];
  number?: number;
  // Section 17 final checklist items (id -> checked).
  checklist?: Record<string, boolean>;
}

export type WizardAnswers = Record<string, WizardAnswer>;

export interface Walkthrough {
  id: string;
  userId?: string;
  createdAt: number;
  updatedAt: number;
  address: PropertyAddress;
  config: PreWalkConfig;
  answers: WizardAnswers;
  lastRoute?: string;
  completedAt?: number | null;
  uploadStatus?: "pending" | "uploading" | "photos_complete" | "confirmed" | "failed";
  driveFolderUrl?: string | null;
  uploadedAt?: number | null;
}

// All keys are scoped per-user via scopedKey() so two accounts on the same
// device cannot read or overwrite each other's local state.
import { onUserScopeChange, scopedKey } from "./local-scope";

const ACTIVE_KEY = () => scopedKey("propertywalk:active-id");
const CACHE_PREFIX = () => `${scopedKey("propertywalk:cache")}:`;
const COMPLETED_KEY = () => scopedKey("propertywalk_completed");
const ADMIN_EDIT_KEY = () => scopedKey("propertywalk:admin-editing");
// COMPLETING_KEY is intentionally unscoped — it is a transient flag used in
// the same-user sign-out path and is cleared on next mount.
export const COMPLETING_KEY = "propertywalk_completing";
const MAX_COMPLETED = 50;

// ---------- admin-edit session ----------
// When an admin opens another agent's walkthrough for tech-support edits, we
// flag the local session so the wizard UI can show a banner, hide submit/upload
// actions, and make photo controls read-only. The flag is per-browser only.
export interface AdminEditMeta {
  walkthroughId: string;
  agentName: string;
  agentId: string;
  address: string;
  // "edit" = full wizard edit; "fix" = Fix Missing Items flow.
  mode?: "edit" | "fix";
}

export function setAdminEditing(meta: AdminEditMeta | null) {
  if (typeof window === "undefined") return;
  try {
    if (meta) localStorage.setItem(ADMIN_EDIT_KEY(), JSON.stringify(meta));
    else localStorage.removeItem(ADMIN_EDIT_KEY());
  } catch {
    // ignore
  }
}

export function getAdminEditing(): AdminEditMeta | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ADMIN_EDIT_KEY());
    if (!raw) return null;
    const m = JSON.parse(raw) as AdminEditMeta;
    const active = getActiveId();
    if (active && m.walkthroughId === active) return m;
    return null;
  } catch {
    return null;
  }
}

export function isAdminEditing(): boolean {
  return !!getAdminEditing();
}

// Lightweight summary stored in localStorage. The full walkthrough (with
// answers and photos) lives in Supabase — local storage only needs enough
// to render the My Walkthroughs list and home screen card.
export interface CompletedSummary {
  id: string;
  propertyAddress: string;
  completedAt: number;
  totalPhotos: number;
  criticalFlags: { questionId: string; label: string; notes?: string }[];
  uploadStatus?: "pending" | "uploading" | "photos_complete" | "confirmed" | "failed";
  driveFolderUrl?: string | null;
}

// Backwards-compatible alias for the old name used across the app.
export type CompletedRecord = CompletedSummary;

function formatAddress(a: PropertyAddress): string {
  const street = [a.houseNumber, a.streetName].filter(Boolean).join(" ").trim();
  const stateZip = [a.state, a.zipCode].filter(Boolean).join(" ").trim();
  const cityStateZip = [a.city, stateZip].filter((s) => s && s.length > 0).join(", ");
  return [street, cityStateZip].filter(Boolean).join(", ");
}

/**
 * Public formatter for the property address — used by the wizard header,
 * review screen, and complete screen so they all show the same string,
 * e.g. "1128 Reseda Blvd, Los Angeles, CA".
 */
export function formatPropertyAddress(a: PropertyAddress | undefined | null): string {
  if (!a) return "";
  return formatAddress(a);
}

function buildCompletedSummary(w: Walkthrough): CompletedSummary {
  let totalPhotos = 0;
  const criticalFlags: CompletedSummary["criticalFlags"] = [];
  for (const [qid, ans] of Object.entries(w.answers ?? {})) {
    if (ans.photos) totalPhotos += ans.photos.length;
    // Rating of 3 = Poor → treat as critical flag
    if (ans.rating === 3) {
      criticalFlags.push({ questionId: qid, label: qid, notes: ans.notes });
    }
  }
  return {
    id: w.id,
    propertyAddress: formatAddress(w.address),
    completedAt: w.completedAt ?? Date.now(),
    totalPhotos,
    criticalFlags,
    uploadStatus: w.uploadStatus,
    driveFolderUrl: w.driveFolderUrl,
  };
}

function writeCompletedList(summaries: CompletedSummary[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(COMPLETED_KEY(), JSON.stringify(summaries));
  } catch (e) {
    console.warn(
      "[walkthrough] localStorage quota exceeded — Supabase has the data",
      e
    );
    // Do not show error to user. Supabase is the source of truth.
  }
}

export function listCompletedLocal(): CompletedSummary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(COMPLETED_KEY());
    if (!raw) return [];
    const arr = JSON.parse(raw) as CompletedSummary[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function saveCompletedLocal(w: Walkthrough): CompletedSummary {
  const summary = buildCompletedSummary(w);
  if (typeof window === "undefined") return summary;
  const existing = listCompletedLocal().filter((r) => r.id !== summary.id);
  const next = [summary, ...existing].slice(0, MAX_COMPLETED);
  writeCompletedList(next);
  return summary;
}

export function getCompletedLocalById(id: string): CompletedSummary | null {
  return listCompletedLocal().find((r) => r.id === id) ?? null;
}

export function getLatestCompletedLocal(): CompletedSummary | null {
  return listCompletedLocal()[0] ?? null;
}

export function removeCompletedLocal(id: string) {
  if (typeof window === "undefined") return;
  const next = listCompletedLocal().filter((r) => r.id !== id);
  writeCompletedList(next);
}

// ---------- local cache helpers (fast UI, survives reload) ----------
//
// PERFORMANCE: We keep an in-memory mirror of the active walkthrough so that
// hot paths (loadActive on every render via useMemo, setAnswer on every
// keystroke) don't have to JSON.parse / JSON.stringify the entire walkthrough
// against localStorage. Without this, a walkthrough with many answers would
// block the main thread for hundreds of ms per keystroke on mobile and cause
// the app to appear frozen.

function cacheKey(id: string) {
  return `${CACHE_PREFIX()}${id}`;
}

// Wipe in-memory mirrors when the signed-in user changes so admin/agent
// sessions on the same device cannot read each other's drafts.
const memCache = new Map<string, Walkthrough>();
if (typeof window !== "undefined") {
  onUserScopeChange(() => {
    memCache.clear();
  });
}

// In-memory mirror. Source of truth for the running session; localStorage is
// only used for cross-reload survival.
const memCache = new Map<string, Walkthrough>();

// Strip embedded data: / blob: photo URLs before persisting. Photos belong in
// IndexedDB (photo-store). Any data URL that slipped into answers (legacy
// drafts or capture races) would balloon the cached JSON past the 5MB iOS
// quota and throw on every save.
function stripEmbeddedPhotos(w: Walkthrough): Walkthrough {
  if (!w.answers) return w;
  let touched = false;
  const nextAnswers: WizardAnswers = {};
  for (const [qid, ans] of Object.entries(w.answers)) {
    let nextAns = ans;
    const cleanList = (list?: string[]) => {
      if (!list || list.length === 0) return list;
      const cleaned = list.filter(
        (p) => !!p && !p.startsWith("data:") && !p.startsWith("blob:"),
      );
      return cleaned.length === list.length ? list : cleaned;
    };
    const photos = cleanList(ans.photos);
    const poorPhotos = cleanList(ans.poorPhotos);
    if (photos !== ans.photos || poorPhotos !== ans.poorPhotos) {
      nextAns = { ...ans, photos, poorPhotos };
      touched = true;
    }
    nextAnswers[qid] = nextAns;
  }
  return touched ? { ...w, answers: nextAnswers } : w;
}

function readCache(id: string): Walkthrough | null {
  const mem = memCache.get(id);
  if (mem) return mem;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Walkthrough;
    memCache.set(id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(w: Walkthrough) {
  // Always update the in-memory mirror first so subsequent reads are
  // consistent even when the localStorage write fails.
  memCache.set(w.id, w);
  if (typeof window === "undefined") return;
  try {
    const safe = stripEmbeddedPhotos(w);
    localStorage.setItem(cacheKey(w.id), JSON.stringify(safe));
    localStorage.setItem(ACTIVE_KEY(), w.id);
  } catch (e) {
    // Quota exceeded or storage unavailable — Supabase remains the source
    // of truth; in-memory mirror keeps the UI responsive for this session.
    console.warn("[walkthrough] writeCache failed (quota?)", e);
    try {
      localStorage.setItem(ACTIVE_KEY(), w.id);
    } catch {
      // ignore
    }
  }
}

function clearCache(id: string) {
  memCache.delete(id);
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(cacheKey(id));
    if (localStorage.getItem(ACTIVE_KEY()) === id) {
      localStorage.removeItem(ACTIVE_KEY());
    }
  } catch {
    // ignore
  }
}

export function getActiveId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(ACTIVE_KEY());
  } catch {
    return null;
  }
}

export function setActiveId(id: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACTIVE_KEY(), id);
  } catch (e) {
    console.warn("[walkthrough] setActiveId failed", e);
  }
}

export function loadActive(): Walkthrough | null {
  const id = getActiveId();
  return id ? readCache(id) : null;
}

/**
 * Make `id` the active walkthrough. If we don't have it cached locally yet,
 * fetch from Supabase and prime the cache so the wizard can resume.
 */
export async function resumeWalkthrough(id: string): Promise<Walkthrough | null> {
  let w = readCache(id);
  if (!w) {
    w = await fetchById(id);
    if (w) writeCache(w);
  }
  setActiveId(id);
  return w;
}

// ---------- DB <-> domain mapping ----------

interface DbRow {
  id: string;
  user_id: string;
  house_number: string;
  street_name: string;
  city: string;
  state: string;
  zip_code: string | null;
  config: PreWalkConfig;
  answers: WizardAnswers;
  last_route: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  upload_status?: string | null;
  drive_folder_url?: string | null;
  uploaded_at?: string | null;
}

function fromDb(row: DbRow): Walkthrough {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    address: {
      houseNumber: row.house_number,
      streetName: row.street_name,
      city: row.city,
      zipCode: row.zip_code ?? "",
      state: row.state ?? "",
    },
    config: row.config ?? {},
    answers: row.answers ?? {},
    lastRoute: row.last_route ?? undefined,
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
    uploadStatus: (row.upload_status as Walkthrough["uploadStatus"]) ?? "pending",
    driveFolderUrl: row.drive_folder_url ?? null,
    uploadedAt: row.uploaded_at ? new Date(row.uploaded_at).getTime() : null,
  };
}

// ---------- public API ----------

export async function createWalkthrough(userId: string): Promise<Walkthrough> {
  const { data, error } = await supabase
    .from("walkthroughs")
    .insert({ user_id: userId })
    .select()
    .single();
  if (error) throw error;
  const w = fromDb(data as DbRow);
  writeCache(w);
  return w;
}

export async function fetchLatestInProgress(userId: string): Promise<Walkthrough | null> {
  const { data, error } = await supabase
    .from("walkthroughs")
    .select("*")
    .eq("user_id", userId)
    .is("completed_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return fromDb(data as DbRow);
}

export async function fetchAllInProgress(userId: string): Promise<Walkthrough[]> {
  const { data, error } = await supabase
    .from("walkthroughs")
    .select("*")
    .eq("user_id", userId)
    .is("completed_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => fromDb(r as DbRow));
}

export async function fetchCompleted(userId: string): Promise<Walkthrough[]> {
  const { data, error } = await supabase
    .from("walkthroughs")
    .select("*")
    .eq("user_id", userId)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((r) => fromDb(r as DbRow));
}

export async function fetchById(id: string): Promise<Walkthrough | null> {
  const { data, error } = await supabase
    .from("walkthroughs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? fromDb(data as DbRow) : null;
}


interface DbPatch {
  house_number?: string;
  street_name?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  config?: PreWalkConfig;
  answers?: WizardAnswers;
  last_route?: string | null;
  completed_at?: string | null;
}

// Debounce per-walkthrough so we don't flood the API on every keystroke.
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const queued = new Map<string, DbPatch>();

async function flush(id: string): Promise<void> {
  const patch = queued.get(id);
  queued.delete(id);
  pending.delete(id);
  if (!patch) return;
  // jsonb columns are typed as `Json` by generated types; our domain shapes
  // are JSON-serializable so we cast at the boundary.
  const { error } = await supabase
    .from("walkthroughs")
    .update(patch as unknown as never)
    .eq("id", id);
  if (error) console.error("[walkthrough] flush failed", error);
}

function schedule(id: string, patch: DbPatch) {
  const merged = { ...(queued.get(id) ?? {}), ...patch };
  queued.set(id, merged);
  if (pending.has(id)) clearTimeout(pending.get(id)!);
  pending.set(id, setTimeout(() => void flush(id), 500));
  console.log("[walkthrough] save scheduled", { id, keys: Object.keys(merged) });
}

export async function deleteWalkthrough(id: string): Promise<void> {
  if (pending.has(id)) {
    clearTimeout(pending.get(id)!);
    pending.delete(id);
    queued.delete(id);
  }

  // Collect photo filenames referenced by this walkthrough so we can purge
  // them from IndexedDB after the DB row is deleted.
  const cached = readCache(id) ?? (await fetchById(id).catch(() => null));
  const photoNames = new Set<string>();
  if (cached?.answers) {
    for (const ans of Object.values(cached.answers)) {
      ans.photoNames?.forEach((n) => n && photoNames.add(n));
      ans.poorPhotoNames?.forEach((n) => n && photoNames.add(n));
      // Older drafts may have stored filenames directly in `photos`.
      ans.photos?.forEach((p) => {
        if (p && !p.startsWith("data:") && !p.startsWith("blob:") && !p.startsWith("http")) {
          photoNames.add(p);
        }
      });
    }
  }

  const { error } = await supabase.from("walkthroughs").delete().eq("id", id);
  if (error) throw error;

  clearCache(id);
  removeCompletedLocal(id);

  // Purge photos from IndexedDB. Best-effort — failures are non-fatal.
  if (photoNames.size > 0) {
    const { removePhoto } = await import("./photo-store");
    await Promise.all(
      Array.from(photoNames).map((n) => removePhoto(n).catch(() => undefined))
    );
  }

  console.log("[walkthrough] deleted", id, { photos: photoNames.size });
}

export function updateWalkthrough(patch: Partial<Walkthrough>): Walkthrough | null {
  const current = loadActive();
  if (!current) return null;
  const next: Walkthrough = { ...current, ...patch, updatedAt: Date.now() };
  writeCache(next);

  const dbPatch: DbPatch = {};
  if (patch.address) {
    dbPatch.house_number = next.address.houseNumber;
    dbPatch.street_name = next.address.streetName;
    dbPatch.city = next.address.city;
    dbPatch.state = next.address.state;
    dbPatch.zip_code = next.address.zipCode;
  }
  if (patch.config) dbPatch.config = next.config;
  if (patch.answers) dbPatch.answers = next.answers;
  if (patch.lastRoute !== undefined) dbPatch.last_route = next.lastRoute ?? null;
  if (patch.completedAt !== undefined) {
    dbPatch.completed_at = next.completedAt ? new Date(next.completedAt).toISOString() : null;
  }
  if (Object.keys(dbPatch).length > 0) schedule(next.id, dbPatch);
  return next;
}

export function setAnswer(questionId: string, answer: WizardAnswer): Walkthrough | null {
  const current = loadActive();
  if (!current) return null;
  const merged = { ...current.answers[questionId], ...answer };
  const nextAnswers = {
    ...current.answers,
    [questionId]: merged,
  };
  console.log(`SAVED: ${questionId} =`, merged);
  return updateWalkthrough({ answers: nextAnswers });
}

export async function completeWalkthrough(): Promise<Walkthrough | null> {
  const current = loadActive();
  if (!current) return null;
  const next = updateWalkthrough({ completedAt: Date.now() });
  if (next) {
    saveCompletedLocal(next);

    // Await the DB write so completed_at is set in Supabase before we navigate away
    if (pending.has(next.id)) {
      clearTimeout(pending.get(next.id)!);
    }
    // Always flush regardless of pending state
    await flush(next.id);

    clearCache(next.id);
    if (typeof window !== "undefined") {
      localStorage.removeItem("propertywalk_draft");
    }
  }
  return next;
}

// Called when the user explicitly submits to Drive (Phase 5) or after they
// confirm they want to discard the active draft. Removes the in-progress
// cache so sensitive data (lockbox code, etc.) is wiped from the device.
export async function submitWalkthrough(): Promise<void> {
  const current = loadActive();
  if (!current) return;
  if (pending.has(current.id)) {
    clearTimeout(pending.get(current.id)!);
    await flush(current.id);
  }
  clearCache(current.id);
}

export function discardActive() {
  const id = getActiveId();
  if (!id) return;
  clearCache(id);
}

// Flush any pending writes for the walkthrough being admin-edited and then
// clear the local cache + admin-edit flag so the admin's session no longer
// references the agent's walkthrough.
export async function exitAdminEdit(): Promise<void> {
  const meta = getAdminEditing();
  if (meta) {
    if (pending.has(meta.walkthroughId)) {
      clearTimeout(pending.get(meta.walkthroughId)!);
      await flush(meta.walkthroughId);
    }
    clearCache(meta.walkthroughId);
  }
  setAdminEditing(null);
}

export function formatTimestamp(ts: number) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
