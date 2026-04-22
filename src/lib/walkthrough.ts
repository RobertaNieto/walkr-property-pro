// Walkthrough storage + types. All persistence is local (localStorage).

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
  photos?: string[]; // data URLs
}

export type WizardAnswers = Record<string, WizardAnswer>;

export interface Walkthrough {
  id: string;
  createdAt: number;
  updatedAt: number;
  address: PropertyAddress;
  config: PreWalkConfig;
  answers: WizardAnswers;
  // Last route the user was on (for resume)
  lastRoute?: string;
}

const KEY = "propertywalk:current";

export function loadWalkthrough(): Walkthrough | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Walkthrough;
  } catch {
    return null;
  }
}

export function saveWalkthrough(w: Walkthrough) {
  if (typeof window === "undefined") return;
  w.updatedAt = Date.now();
  localStorage.setItem(KEY, JSON.stringify(w));
}

export function clearWalkthrough() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function createWalkthrough(): Walkthrough {
  const w: Walkthrough = {
    id: `wt_${Date.now().toString(36)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    address: { houseNumber: "", streetName: "", city: "" },
    config: {},
    answers: {},
  };
  saveWalkthrough(w);
  return w;
}

export function updateWalkthrough(patch: Partial<Walkthrough>) {
  const current = loadWalkthrough();
  if (!current) return null;
  const next = { ...current, ...patch, updatedAt: Date.now() };
  saveWalkthrough(next);
  return next;
}

export function setAnswer(questionId: string, answer: WizardAnswer) {
  const current = loadWalkthrough();
  if (!current) return null;
  const next: Walkthrough = {
    ...current,
    answers: { ...current.answers, [questionId]: { ...current.answers[questionId], ...answer } },
    updatedAt: Date.now(),
  };
  saveWalkthrough(next);
  return next;
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
