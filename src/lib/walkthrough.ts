// Walkthrough persistence. Source of truth is Supabase (per-user, RLS-protected).
// localStorage is used only as a temporary draft cache before the user has
// authenticated, and as an in-memory mirror for fast UI updates.

import { supabase } from "@/integrations/supabase/client";

export type Rating = 1 | 2 | 3;

export interface PropertyAddress {
  houseNumber: string;
  streetName: string;
  city: string;
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

export interface WizardAnswer {
  text?: string;
  rating?: Rating;
  notes?: string;
  photos?: string[];
}

export type WizardAnswers = Record<string, WizardAnswer>;

export interface Walkthrough {
  id: string;
  createdAt: number;
  updatedAt: number;
  address: PropertyAddress;
  config: PreWalkConfig;
  answers: WizardAnswers;
  lastRoute?: string;
  completedAt?: number | null;
}

const ACTIVE_KEY = "propertywalk:active-id";
const CACHE_PREFIX = "propertywalk:cache:";

// ---------- local cache helpers (fast UI, survives reload) ----------

function cacheKey(id: string) {
  return `${CACHE_PREFIX}${id}`;
}

function readCache(id: string): Walkthrough | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(id));
    return raw ? (JSON.parse(raw) as Walkthrough) : null;
  } catch {
    return null;
  }
}

function writeCache(w: Walkthrough) {
  if (typeof window === "undefined") return;
  localStorage.setItem(cacheKey(w.id), JSON.stringify(w));
  localStorage.setItem(ACTIVE_KEY, w.id);
}

function clearCache(id: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(cacheKey(id));
  if (localStorage.getItem(ACTIVE_KEY) === id) {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

export function getActiveId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_KEY);
}

export function loadActive(): Walkthrough | null {
  const id = getActiveId();
  return id ? readCache(id) : null;
}

// ---------- DB <-> domain mapping ----------

interface DbRow {
  id: string;
  user_id: string;
  house_number: string;
  street_name: string;
  city: string;
  config: PreWalkConfig;
  answers: WizardAnswers;
  last_route: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

function fromDb(row: DbRow): Walkthrough {
  return {
    id: row.id,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    address: {
      houseNumber: row.house_number,
      streetName: row.street_name,
      city: row.city,
    },
    config: row.config ?? {},
    answers: row.answers ?? {},
    lastRoute: row.last_route ?? undefined,
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
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
  const w = fromDb(data as DbRow);
  writeCache(w);
  return w;
}

interface DbPatch {
  house_number?: string;
  street_name?: string;
  city?: string;
  config?: PreWalkConfig;
  answers?: WizardAnswers;
  last_route?: string | null;
  completed_at?: string | null;
}

// Debounce per-walkthrough so we don't flood the API on every keystroke.
const pending = new Map<string, ReturnType<typeof setTimeout>>();
const queued = new Map<string, DbPatch>();

function flush(id: string) {
  const patch = queued.get(id);
  queued.delete(id);
  pending.delete(id);
  if (!patch) return;
  // jsonb columns are typed as `Json` by generated types; our domain shapes
  // are JSON-serializable so we cast at the boundary.
  void supabase
    .from("walkthroughs")
    .update(patch as unknown as never)
    .eq("id", id);
}

function schedule(id: string, patch: DbPatch) {
  const merged = { ...(queued.get(id) ?? {}), ...patch };
  queued.set(id, merged);
  if (pending.has(id)) clearTimeout(pending.get(id)!);
  pending.set(id, setTimeout(() => flush(id), 500));
  console.log("[walkthrough] save scheduled", { id, keys: Object.keys(merged) });
}

export async function deleteWalkthrough(id: string): Promise<void> {
  if (pending.has(id)) {
    clearTimeout(pending.get(id)!);
    pending.delete(id);
    queued.delete(id);
  }
  const { error } = await supabase.from("walkthroughs").delete().eq("id", id);
  if (error) throw error;
  clearCache(id);
  console.log("[walkthrough] deleted", id);
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

export function completeWalkthrough(): Walkthrough | null {
  const current = loadActive();
  if (!current) return null;
  const next = updateWalkthrough({ completedAt: Date.now() });
  if (next) {
    // Flush pending writes immediately, then drop local cache so the lockbox
    // code is no longer sitting in browser storage.
    if (pending.has(next.id)) {
      clearTimeout(pending.get(next.id)!);
      flush(next.id);
    }
    clearCache(next.id);
  }
  return next;
}

export function discardActive() {
  const id = getActiveId();
  if (!id) return;
  clearCache(id);
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
