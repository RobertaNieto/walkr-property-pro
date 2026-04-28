import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Mail, ShieldOff, ShieldCheck, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/admin")({
  component: AdminScreen,
});

interface AgentRow {
  id: string;
  user_id: string;
  role: "admin" | "agent";
  status: "active" | "blocked";
  full_name: string | null;
  email: string | null;
  invited_at: string;
  completed_count?: number;
  uploaded_count?: number;
}

interface WalkRow {
  id: string;
  user_id: string;
  house_number: string;
  street_name: string;
  city: string;
  state: string;
  created_at: string;
  completed_at: string | null;
  upload_status: string | null;
}

type SortKey = "date" | "agent" | "status";

function formatAddress(w: WalkRow) {
  const street = [w.house_number, w.street_name].filter(Boolean).join(" ").trim();
  return [street, w.city, w.state].filter(Boolean).join(", ") || "Untitled";
}

function statusOf(w: WalkRow): "in-progress" | "completed" | "uploaded" {
  if (!w.completed_at) return "in-progress";
  if (w.upload_status === "confirmed") return "uploaded";
  return "completed";
}

function StatusBadge({ s }: { s: "in-progress" | "completed" | "uploaded" }) {
  const map = {
    "in-progress": "bg-yellow-500/15 text-yellow-700 ring-yellow-500/30 dark:text-yellow-400",
    completed: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400",
    uploaded: "bg-blue-500/15 text-blue-700 ring-blue-500/30 dark:text-blue-400",
  } as const;
  const labels = { "in-progress": "In Progress", completed: "Completed", uploaded: "Uploaded" };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${map[s]}`}>
      {labels[s]}
    </span>
  );
}

function AdminScreen() {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" />;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <Link
            to="/"
            aria-label="Back"
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-lg font-bold text-foreground">Admin Panel</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">
        <Tabs defaultValue="agents" className="w-full">
          <TabsList className="grid h-11 w-full grid-cols-2">
            <TabsTrigger value="agents" className="text-sm font-semibold">Agents</TabsTrigger>
            <TabsTrigger value="walkthroughs" className="text-sm font-semibold">
              All Walkthroughs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="mt-4">
            <AgentsTab />
          </TabsContent>
          <TabsContent value="walkthroughs" className="mt-4">
            <WalkthroughsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function AgentsTab() {
  const [rows, setRows] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: roles, error } = await supabase
      .from("user_roles")
      .select("id,user_id,role,status,full_name,email,invited_at")
      .order("invited_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    // Aggregate walkthrough counts per agent (admin can read all walkthroughs).
    const { data: walks } = await supabase
      .from("walkthroughs")
      .select("user_id,completed_at,upload_status");

    const completedMap = new Map<string, number>();
    const uploadedMap = new Map<string, number>();
    (walks ?? []).forEach((w) => {
      if (w.completed_at) completedMap.set(w.user_id, (completedMap.get(w.user_id) ?? 0) + 1);
      if (w.upload_status === "confirmed")
        uploadedMap.set(w.user_id, (uploadedMap.get(w.user_id) ?? 0) + 1);
    });

    const enriched = (roles ?? []).map((r) => ({
      ...(r as AgentRow),
      completed_count: completedMap.get(r.user_id) ?? 0,
      uploaded_count: uploadedMap.get(r.user_id) ?? 0,
    }));
    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleBlock = async (row: AgentRow) => {
    setBusyId(row.id);
    const next = row.status === "active" ? "blocked" : "active";
    const { error } = await supabase
      .from("user_roles")
      .update({ status: next })
      .eq("id", row.id);
    setBusyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next === "blocked" ? "Agent blocked" : "Agent unblocked");
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "user" : "users"}
        </p>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-semibold text-accent-foreground hover:bg-accent/90"
        >
          <UserPlus className="h-4 w-4" />
          Invite Agent
        </button>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No users yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Name / Email</th>
                <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                <th className="px-3 py-2.5 text-left font-semibold">Invited</th>
                <th className="px-3 py-2.5 text-left font-semibold">Completed</th>
                <th className="px-3 py-2.5 text-left font-semibold">Uploaded</th>
                <th className="px-3 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-foreground">
                      {r.full_name || "—"}
                      {r.role === "admin" && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.status === "active" ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-400">
                        Blocked
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {new Date(r.invited_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{r.completed_count}</td>
                  <td className="px-3 py-2.5 tabular-nums">{r.uploaded_count}</td>
                  <td className="px-3 py-2.5 text-right">
                    {r.role === "admin" ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : r.status === "active" ? (
                      <button
                        onClick={() => void toggleBlock(r)}
                        disabled={busyId === r.id}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-red-600 px-2.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                      >
                        {busyId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShieldOff className="h-3.5 w-3.5" />
                        )}
                        Block
                      </button>
                    ) : (
                      <button
                        onClick={() => void toggleBlock(r)}
                        disabled={busyId === r.id}
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {busyId === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        )}
                        Unblock
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <InviteAgentDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={() => void load()}
      />
    </div>
  );
}

function InviteAgentDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onInvited: () => void;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setFullName("");
    setEmail("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      toast.error("Full name and email required");
      return;
    }
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke("invite-agent", {
      body: { full_name: fullName.trim(), email: email.trim() },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if ((data as { error?: string })?.error) {
      toast.error((data as { error: string }).error);
      return;
    }
    toast.success("Invite sent");
    reset();
    onOpenChange(false);
    onInvited();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Agent</DialogTitle>
          <DialogDescription>
            Sends an email invite. They become an active agent on signup.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              required
              className="h-11 w-full rounded-xl border-2 border-input bg-card px-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@example.com"
              required
              className="h-11 w-full rounded-xl border-2 border-input bg-card px-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-10 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-accent/90 disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send Invite
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WalkthroughsTab() {
  const [rows, setRows] = useState<WalkRow[]>([]);
  const [agents, setAgents] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("date");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [{ data: walks, error }, { data: roles }] = await Promise.all([
        supabase
          .from("walkthroughs")
          .select("id,user_id,house_number,street_name,city,state,created_at,completed_at,upload_status")
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id,full_name,email"),
      ]);
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      const m = new Map<string, string>();
      (roles ?? []).forEach((r) => {
        m.set(r.user_id, r.full_name || r.email || r.user_id.slice(0, 8));
      });
      setAgents(m);
      setRows((walks ?? []) as WalkRow[]);
      setLoading(false);
    })();
  }, []);

  const sorted = useMemo(() => {
    const arr = [...rows];
    if (sortKey === "date") {
      arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortKey === "agent") {
      arr.sort((a, b) =>
        (agents.get(a.user_id) ?? "").localeCompare(agents.get(b.user_id) ?? ""),
      );
    } else {
      const order = { "in-progress": 0, completed: 1, uploaded: 2 } as const;
      arr.sort((a, b) => order[statusOf(a)] - order[statusOf(b)]);
    }
    return arr;
  }, [rows, sortKey, agents]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "walkthrough" : "walkthroughs"}
        </p>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-muted-foreground">Sort:</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-9 rounded-lg border border-input bg-card px-2 text-sm focus:border-accent focus:outline-none"
          >
            <option value="date">Date</option>
            <option value="agent">Agent</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No walkthroughs yet.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold">Property</th>
                <th className="px-3 py-2.5 text-left font-semibold">Agent</th>
                <th className="px-3 py-2.5 text-left font-semibold">Started</th>
                <th className="px-3 py-2.5 text-left font-semibold">Status</th>
                <th className="px-3 py-2.5 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((w) => (
                <tr key={w.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2.5 font-semibold text-foreground">
                    {formatAddress(w)}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {agents.get(w.user_id) ?? w.user_id.slice(0, 8)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {new Date(w.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge s={statusOf(w)} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      to="/review/$id"
                      params={{ id: w.id }}
                      className="inline-flex h-8 items-center rounded-lg bg-primary px-2.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                    >
                      View Report
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
