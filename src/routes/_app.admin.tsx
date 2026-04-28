import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  CloudUpload,
  Loader2,
  Mail,
  Search,
  ShieldCheck,
  ShieldOff,
  UserPlus,
  Users,
  ClipboardList,
  Clock,
} from "lucide-react";
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

// ---------- helpers ----------
function initialsOf(name?: string | null, email?: string | null) {
  const src = (name?.trim() || email?.split("@")[0] || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  const letters =
    parts.length >= 2
      ? parts[0][0] + parts[parts.length - 1][0]
      : src.slice(0, 2);
  return letters.toUpperCase();
}

function formatStreet(w: WalkRow) {
  return [w.house_number, w.street_name].filter(Boolean).join(" ").trim();
}
function formatCityState(w: WalkRow) {
  return [w.city, w.state].filter(Boolean).join(", ").trim();
}
function hasAddress(w: WalkRow) {
  return Boolean(formatStreet(w) || formatCityState(w));
}
function statusOf(w: WalkRow): "in-progress" | "completed" | "uploaded" {
  if (!w.completed_at) return "in-progress";
  if (w.upload_status === "confirmed") return "uploaded";
  return "completed";
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ---------- shared atoms ----------
function Avatar({
  name,
  email,
  size = "md",
  tone = "primary",
}: {
  name?: string | null;
  email?: string | null;
  size?: "sm" | "md" | "lg";
  tone?: "primary" | "muted";
}) {
  const dim =
    size === "lg" ? "h-12 w-12 text-base" : size === "sm" ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-sm";
  const toneCls =
    tone === "primary"
      ? "bg-primary/10 text-primary ring-1 ring-primary/20"
      : "bg-muted text-foreground/70 ring-1 ring-border";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold ${dim} ${toneCls}`}
    >
      {initialsOf(name, email)}
    </span>
  );
}

function Pill({
  children,
  tone,
  className = "",
}: {
  children: React.ReactNode;
  tone:
    | "navy"
    | "gray"
    | "green"
    | "red"
    | "amber"
    | "blue"
    | "successSoft";
  className?: string;
}) {
  const tones: Record<string, string> = {
    navy: "bg-primary text-primary-foreground",
    gray: "bg-muted text-foreground/70 ring-1 ring-border",
    green: "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-400",
    red: "bg-red-500/15 text-red-700 ring-1 ring-red-500/30 dark:text-red-400",
    amber: "bg-amber-500/15 text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-400",
    blue: "bg-blue-500/15 text-blue-700 ring-1 ring-blue-500/30 dark:text-blue-400",
    successSoft: "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20 dark:text-emerald-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

function StatusBadge({ s }: { s: "in-progress" | "completed" | "uploaded" }) {
  if (s === "in-progress") return <Pill tone="amber">In Progress</Pill>;
  if (s === "completed") return <Pill tone="blue">Completed</Pill>;
  return <Pill tone="green">Uploaded</Pill>;
}

function StatCard({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-bold leading-none tabular-nums text-foreground">
          {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : value}
        </div>
        <div className="mt-1 truncate text-xs font-medium text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

// ---------- screen ----------
function AdminScreen() {
  const { isAdmin, loading } = useAuth();

  // shared summary state (loaded once, refreshed by tabs)
  const [summary, setSummary] = useState({
    agents: 0,
    walkthroughs: 0,
    uploaded: 0,
    inProgress: 0,
    loading: true,
  });

  const loadSummary = async () => {
    setSummary((s) => ({ ...s, loading: true }));
    const [{ data: roles }, { data: walks }] = await Promise.all([
      supabase.from("user_roles").select("id"),
      supabase.from("walkthroughs").select("completed_at,upload_status"),
    ]);
    const all = walks ?? [];
    setSummary({
      agents: roles?.length ?? 0,
      walkthroughs: all.length,
      uploaded: all.filter((w) => w.upload_status === "confirmed").length,
      inProgress: all.filter((w) => !w.completed_at).length,
      loading: false,
    });
  };

  useEffect(() => {
    if (isAdmin) void loadSummary();
  }, [isAdmin]);

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
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <Link
            to="/"
            aria-label="Back"
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight text-foreground">Admin Panel</h1>
            <p className="text-xs text-muted-foreground">Manage agents and walkthroughs</p>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-4 py-5">
        {/* Summary bar */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={<Users className="h-5 w-5" />}
            label="Total agents"
            value={summary.agents}
            loading={summary.loading}
          />
          <StatCard
            icon={<ClipboardList className="h-5 w-5" />}
            label="Total walkthroughs"
            value={summary.walkthroughs}
            loading={summary.loading}
          />
          <StatCard
            icon={<CloudUpload className="h-5 w-5" />}
            label="Uploaded to Drive"
            value={summary.uploaded}
            loading={summary.loading}
          />
          <StatCard
            icon={<Clock className="h-5 w-5" />}
            label="In Progress"
            value={summary.inProgress}
            loading={summary.loading}
          />
        </section>

        <Tabs defaultValue="agents" className="w-full">
          <TabsList className="grid h-11 w-full grid-cols-2 sm:w-auto sm:inline-grid">
            <TabsTrigger value="agents" className="text-sm font-semibold sm:px-6">
              Agents
            </TabsTrigger>
            <TabsTrigger value="walkthroughs" className="text-sm font-semibold sm:px-6">
              All Walkthroughs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="agents" className="mt-4">
            <AgentsTab onChange={loadSummary} />
          </TabsContent>
          <TabsContent value="walkthroughs" className="mt-4">
            <WalkthroughsTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ---------- Agents Tab ----------
function AgentsTab({ onChange }: { onChange: () => void }) {
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

    setRows(
      (roles ?? []).map((r) => ({
        ...(r as AgentRow),
        completed_count: completedMap.get(r.user_id) ?? 0,
        uploaded_count: uploadedMap.get(r.user_id) ?? 0,
      })),
    );
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "user" : "users"}
        </p>
        <button
          onClick={() => setInviteOpen(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <UserPlus className="h-4 w-4" />
          Invite Agent
        </button>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No users yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <article
              key={r.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(16,24,40,0.08)]"
            >
              <div className="flex items-start gap-3">
                <Avatar name={r.full_name} email={r.email} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-bold text-foreground">
                      {r.full_name || "Unnamed"}
                    </h3>
                    {r.role === "admin" ? (
                      <Pill tone="navy">ADMIN</Pill>
                    ) : (
                      <Pill tone="gray">AGENT</Pill>
                    )}
                    {r.status === "active" ? (
                      <Pill tone="green">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                      </Pill>
                    ) : (
                      <Pill tone="red">Blocked</Pill>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{r.email}</p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Pill tone="gray">
                      <ClipboardList className="h-3 w-3" />
                      {r.completed_count} completed
                    </Pill>
                    <Pill tone="successSoft">
                      <CloudUpload className="h-3 w-3" />
                      {r.uploaded_count} uploaded
                    </Pill>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">
                  Invited {fmtDate(r.invited_at)}
                </span>
                {r.role === "admin" ? (
                  <span className="text-xs italic text-muted-foreground">No actions</span>
                ) : r.status === "active" ? (
                  <button
                    onClick={() => void toggleBlock(r)}
                    disabled={busyId === r.id}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-500/40 bg-transparent px-3 text-xs font-semibold text-red-700 hover:bg-red-500/10 disabled:opacity-60 dark:text-red-400"
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
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-transparent px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-500/10 disabled:opacity-60 dark:text-emerald-400"
                  >
                    {busyId === r.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    Unblock
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <InviteAgentDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvited={() => {
          void load();
          onChange();
        }}
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
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-md rounded-2xl p-6">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-lg">Invite Agent</DialogTitle>
              <DialogDescription className="text-xs">
                We'll email an invite. They'll join as an active agent on signup.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jane Doe"
              required
              className="h-11 w-full rounded-xl border-2 border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-foreground">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="agent@example.com"
              required
              className="h-11 w-full rounded-xl border-2 border-input bg-background px-3 text-sm transition-colors focus:border-accent focus:outline-none"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
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
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
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

// ---------- Walkthroughs Tab ----------
function WalkthroughsTab() {
  const [rows, setRows] = useState<WalkRow[]>([]);
  const [agents, setAgents] = useState<Map<string, { name: string; email: string | null }>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [query, setQuery] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [{ data: walks, error }, { data: roles }] = await Promise.all([
        supabase
          .from("walkthroughs")
          .select(
            "id,user_id,house_number,street_name,city,state,created_at,completed_at,upload_status",
          )
          .order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id,full_name,email"),
      ]);
      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }
      const m = new Map<string, { name: string; email: string | null }>();
      (roles ?? []).forEach((r) => {
        m.set(r.user_id, {
          name: r.full_name || r.email || r.user_id.slice(0, 8),
          email: r.email,
        });
      });
      setAgents(m);
      setRows((walks ?? []) as WalkRow[]);
      setLoading(false);
    })();
  }, []);

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = rows;
    if (q) {
      arr = rows.filter((w) => {
        const addr = `${formatStreet(w)} ${formatCityState(w)}`.toLowerCase();
        const agent = (agents.get(w.user_id)?.name ?? "").toLowerCase();
        return addr.includes(q) || agent.includes(q);
      });
    }
    const out = [...arr];
    if (sortKey === "date") {
      out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (sortKey === "agent") {
      out.sort((a, b) =>
        (agents.get(a.user_id)?.name ?? "").localeCompare(agents.get(b.user_id)?.name ?? ""),
      );
    } else {
      const order = { "in-progress": 0, completed: 1, uploaded: 2 } as const;
      out.sort((a, b) => order[statusOf(a)] - order[statusOf(b)]);
    }
    return out;
  }, [rows, sortKey, agents, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search address or agent…"
            className="h-10 w-full rounded-xl border-2 border-input bg-card pl-9 pr-3 text-sm transition-colors focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-muted-foreground">Sort:</label>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-10 rounded-xl border-2 border-input bg-card px-3 text-sm font-medium focus:border-accent focus:outline-none"
          >
            <option value="date">Date (newest first)</option>
            <option value="agent">Agent name</option>
            <option value="status">Status</option>
          </select>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {filteredSorted.length} of {rows.length}{" "}
        {rows.length === 1 ? "walkthrough" : "walkthroughs"}
      </p>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : filteredSorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {query ? "No walkthroughs match your search." : "No walkthroughs yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {filteredSorted.map((w) => {
            const agent = agents.get(w.user_id);
            const street = formatStreet(w);
            const city = formatCityState(w);
            const has = hasAddress(w);
            return (
              <article
                key={w.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-shadow hover:shadow-[0_4px_14px_rgba(16,24,40,0.08)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    {has ? (
                      <>
                        <h3 className="truncate text-base font-bold text-foreground">
                          {street || city}
                        </h3>
                        {street && city && (
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">{city}</p>
                        )}
                      </>
                    ) : (
                      <h3 className="truncate text-base italic text-muted-foreground">
                        Address not set
                      </h3>
                    )}
                  </div>
                  <StatusBadge s={statusOf(w)} />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Avatar name={agent?.name} email={agent?.email} size="sm" tone="muted" />
                  <span className="truncate text-sm font-medium text-foreground">
                    {agent?.name ?? w.user_id.slice(0, 8)}
                  </span>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">
                    Started {fmtDate(w.created_at)}
                  </span>
                  <Link
                    to="/review/$id"
                    params={{ id: w.id }}
                    className="inline-flex h-9 items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                  >
                    View Report
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
