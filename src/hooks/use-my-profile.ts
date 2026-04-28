import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export interface MyProfile {
  display_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  license_number: string | null;
}

/**
 * Lightweight hook to read the current user's profile (avatar + display name).
 * Subscribes to a custom 'profile-updated' window event so screens that mutate
 * the profile (e.g. profile screen) can broadcast updates instantly.
 */
export function useMyProfile(): { profile: MyProfile | null; loading: boolean } {
  const { user } = useAuth();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(user));

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("display_name,avatar_url,phone,license_number")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setProfile(
        data
          ? {
              display_name: data.display_name ?? null,
              avatar_url: data.avatar_url ?? null,
              phone: data.phone ?? null,
              license_number: data.license_number ?? null,
            }
          : null,
      );
      setLoading(false);
    };
    void load();
    const onUpdate = () => void load();
    window.addEventListener("profile-updated", onUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener("profile-updated", onUpdate);
    };
  }, [user]);

  return { profile, loading };
}

export function notifyProfileUpdated() {
  window.dispatchEvent(new Event("profile-updated"));
}
