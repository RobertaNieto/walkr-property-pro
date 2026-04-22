import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, LogOut, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/profile")({
  component: ProfileScreen,
});

const profileSchema = z.object({
  display_name: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(40).optional(),
  license_number: z.string().trim().max(60).optional(),
});

function ProfileScreen() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [license, setLicense] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        if (data) {
          setDisplayName(data.display_name ?? "");
          setPhone(data.phone ?? "");
          setLicense(data.license_number ?? "");
          setAvatarUrl(data.avatar_url);
        }
        setLoading(false);
      });
  }, [user]);

  const save = async () => {
    if (!user) return;
    const parsed = profileSchema.safeParse({
      display_name: displayName,
      phone,
      license_number: license,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: parsed.data.display_name || null,
        phone: parsed.data.phone || null,
        license_number: parsed.data.license_number || null,
      })
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  };

  const uploadAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setUploading(false);
      toast.error(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: updErr } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", user.id);
    setUploading(false);
    if (updErr) toast.error(updErr.message);
    else {
      setAvatarUrl(url);
      toast.success("Photo updated");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <Link
            to="/"
            aria-label="Back"
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold text-foreground">Profile</h1>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-secondary text-2xl font-bold text-muted-foreground">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (displayName || user?.email || "?").charAt(0).toUpperCase()
                  )}
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-input bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-secondary">
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  {uploading ? "Uploading…" : "Change photo"}
                  <input type="file" accept="image/*" className="hidden" onChange={uploadAvatar} />
                </label>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Email</label>
                  <input
                    value={user?.email ?? ""}
                    disabled
                    className="h-12 w-full rounded-2xl border-2 border-input bg-muted px-4 text-base text-muted-foreground"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Display name</label>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Jane Doe"
                    maxLength={100}
                    className="h-12 w-full rounded-2xl border-2 border-input bg-card px-4 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Phone</label>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="(555) 123-4567"
                    inputMode="tel"
                    maxLength={40}
                    className="h-12 w-full rounded-2xl border-2 border-input bg-card px-4 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">License #</label>
                  <input
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                    placeholder="DRE 01234567"
                    maxLength={60}
                    className="h-12 w-full rounded-2xl border-2 border-input bg-card px-4 text-base focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  />
                </div>
              </div>

              <button
                onClick={save}
                disabled={saving}
                className="inline-flex h-14 w-full items-center justify-center rounded-2xl bg-primary text-base font-semibold text-primary-foreground shadow-[var(--shadow-elevated)] hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Save changes"}
              </button>

              <button
                onClick={handleSignOut}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-secondary"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
