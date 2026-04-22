import { createFileRoute, Link } from "@tanstack/react-router";
import { Copy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/debug")({
  component: DebugScreen,
});

interface StorageEntry {
  key: string;
  size: number;
  value: string;
}

function bytesToKB(bytes: number) {
  return (bytes / 1024).toFixed(2);
}

function safePretty(raw: string | null) {
  if (raw == null) return "(not set)";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function DebugScreen() {
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [draft, setDraft] = useState<string | null>(null);

  const refresh = () => {
    if (typeof window === "undefined") return;
    const items: StorageEntry[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const value = localStorage.getItem(key) ?? "";
      items.push({ key, size: new Blob([value]).size, value });
    }
    items.sort((a, b) => a.key.localeCompare(b.key));
    setEntries(items);

    // Primary "draft" key requested in the spec, plus the active per-walkthrough cache.
    const explicit = localStorage.getItem("propertywalk_draft");
    if (explicit) {
      setDraft(explicit);
      return;
    }
    const activeId = localStorage.getItem("propertywalk:active-id");
    if (activeId) {
      setDraft(localStorage.getItem(`propertywalk:cache:${activeId}`));
    } else {
      setDraft(null);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const draftPretty = safePretty(draft);
  const draftSize = draft ? new Blob([draft]).size : 0;

  const copyAll = async () => {
    const payload = [
      `=== propertywalk draft (${bytesToKB(draftSize)} KB) ===`,
      draftPretty,
      "",
      "=== all localStorage keys ===",
      ...entries.map((e) => `- ${e.key} (${bytesToKB(e.size)} KB)\n${safePretty(e.value)}`),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(payload);
      toast.success("Copied debug snapshot to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const totalSize = entries.reduce((acc, e) => acc + e.size, 0);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-bold">Debug</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={copyAll}
            className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm font-semibold hover:bg-muted"
          >
            <Copy className="h-4 w-4" />
            Copy
          </button>
          <Link
            to="/"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <X className="h-4 w-4" />
            Close
          </Link>
        </div>
      </header>

      <main className="space-y-6 px-4 py-5">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-bold">propertywalk_draft</h2>
            <span className="text-xs text-muted-foreground">{bytesToKB(draftSize)} KB</span>
          </div>
          <pre className="max-h-[50vh] overflow-auto rounded-xl border bg-muted/40 p-3 text-xs leading-snug">
{draftPretty}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Note: this app persists per-walkthrough under <code>propertywalk:cache:&lt;id&gt;</code>.
            The active draft above is resolved from <code>propertywalk:active-id</code> when no
            literal <code>propertywalk_draft</code> key exists.
          </p>
        </section>

        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-base font-bold">All localStorage keys</h2>
            <span className="text-xs text-muted-foreground">
              {entries.length} keys · {bytesToKB(totalSize)} KB total
            </span>
          </div>
          <ul className="space-y-2">
            {entries.length === 0 ? (
              <li className="rounded-xl border bg-muted/40 p-3 text-sm text-muted-foreground">
                localStorage is empty.
              </li>
            ) : (
              entries.map((e) => (
                <li key={e.key} className="rounded-xl border bg-card p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <code className="break-all text-xs font-semibold">{e.key}</code>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {bytesToKB(e.size)} KB
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
