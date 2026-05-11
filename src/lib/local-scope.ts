// User-scoped local storage keys.
//
// Every key/database name written to the browser MUST be suffixed with the
// current user's id so two accounts on the same device cannot read or write
// each other's data. The auth provider calls setCurrentUserScope() on every
// auth state change and clears it on sign-out.

const CUR_USER_KEY = "propertywalk:current-user";
const PREV_USER_KEY = "propertywalk:previous-user";

type Listener = (userId: string | null) => void;
const listeners = new Set<Listener>();

export function onUserScopeChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setCurrentUserScope(userId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const prev = localStorage.getItem(CUR_USER_KEY);
    if (prev === (userId ?? null)) return;
    if (prev) localStorage.setItem(PREV_USER_KEY, prev);
    if (userId) localStorage.setItem(CUR_USER_KEY, userId);
    else localStorage.removeItem(CUR_USER_KEY);
  } catch {
    // ignore — local storage may be unavailable in private mode
  }
  for (const fn of listeners) {
    try {
      fn(userId);
    } catch {
      // listener errors must not break auth flow
    }
  }
}

export function getCurrentUserScope(): string {
  if (typeof window === "undefined") return "anon";
  try {
    return localStorage.getItem(CUR_USER_KEY) || "anon";
  } catch {
    return "anon";
  }
}

export function getPreviousUserScope(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(PREV_USER_KEY);
  } catch {
    return null;
  }
}

export function clearPreviousUserScope(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PREV_USER_KEY);
  } catch {
    // ignore
  }
}

/** Scope a localStorage key to the current signed-in user. */
export function scopedKey(base: string): string {
  return `${base}:${getCurrentUserScope()}`;
}
