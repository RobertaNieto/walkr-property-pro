import { Session, User } from "@supabase/supabase-js";
import { ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  clearPreviousUserScope,
  getCurrentUserScope,
  getPreviousUserScope,
  setCurrentUserScope,
} from "@/lib/local-scope";

export type UserRole = "admin" | "agent";
export type UserStatus = "active" | "blocked";

export interface RoleInfo {
  role: UserRole;
  status: UserStatus;
  full_name: string | null;
  email: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: RoleInfo | null;
  isAdmin: boolean;
  isBlocked: boolean;
  refreshRole: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const BLOCKED_MESSAGE =
  "Your access has been suspended. Contact your administrator.";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<RoleInfo | null>(null);

  const fetchRole = useCallback(async (userId: string): Promise<RoleInfo | null> => {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role,status,full_name,email")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.error("[auth] fetch role failed", error);
      return null;
    }
    return (data as RoleInfo | null) ?? null;
  }, []);

  const handleSession = useCallback(
    async (newSession: Session | null) => {
      setSession(newSession);
      const newUserId = newSession?.user?.id ?? null;
      // Update the per-device user scope FIRST so any storage helpers
      // invoked downstream (walkthrough cache, photo IDB) see the correct
      // user. setCurrentUserScope is idempotent for the same id.
      const prevScope = getCurrentUserScope();
      setCurrentUserScope(newUserId);
      // If a real account swap happened on this device, warn the user.
      if (
        newUserId &&
        prevScope &&
        prevScope !== "anon" &&
        prevScope !== newUserId
      ) {
        toast.warning(
          "Switching accounts — any unuploaded photos from the previous session will remain on this device but will not be accessible to the new account.",
          { duration: 8000 },
        );
        clearPreviousUserScope();
      } else if (!newUserId && getPreviousUserScope()) {
        clearPreviousUserScope();
      }
      if (!newSession?.user) {
        setRole(null);
        setLoading(false);
        return;
      }
      const r = await fetchRole(newSession.user.id);
      if (r?.status === "blocked") {
        setRole(r);
        setLoading(false);
        toast.error(BLOCKED_MESSAGE);
        await supabase.auth.signOut();
        return;
      }
      setRole(r);
      setLoading(false);
    },
    [fetchRole],
  );

  // Suppress unused import in builds where the ref isn't needed yet.
  void useRef;

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      void handleSession(newSession);
    });
    supabase.auth.getSession().then(({ data }) => {
      void handleSession(data.session);
    });
    return () => sub.subscription.unsubscribe();
  }, [handleSession]);

  // Periodic re-check so admins blocking an agent take effect mid-session.
  useEffect(() => {
    if (!session?.user) return;
    const interval = setInterval(async () => {
      const r = await fetchRole(session.user.id);
      if (r?.status === "blocked") {
        toast.error(BLOCKED_MESSAGE);
        await supabase.auth.signOut();
      } else if (r) {
        setRole(r);
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [session?.user, fetchRole]);

  const refreshRole = useCallback(async () => {
    if (!session?.user) return;
    const r = await fetchRole(session.user.id);
    if (r?.status === "blocked") {
      toast.error(BLOCKED_MESSAGE);
      await supabase.auth.signOut();
      return;
    }
    setRole(r);
  }, [session?.user, fetchRole]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        role,
        isAdmin: role?.role === "admin" && role?.status === "active",
        isBlocked: role?.status === "blocked",
        refreshRole,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
