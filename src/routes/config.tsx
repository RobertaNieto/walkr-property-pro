import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { ChoiceGrid } from "@/components/ChoiceGrid";
import { cn } from "@/lib/utils";
import { loadWalkthrough, updateWalkthrough, type PreWalkConfig } from "@/lib/walkthrough";

export const Route = createFileRoute("/config")({
  component: ConfigScreen,
});

function ConfigScreen() {
  const navigate = useNavigate();
  const router = useRouter();
  const [config, setConfig] = useState<PreWalkConfig>({});

  useEffect(() => {
    const w = loadWalkthrough();
    if (w) setConfig(w.config);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      if (loadWalkthrough()) updateWalkthrough({ config, lastRoute: "/config" });
    }, 150);
    return () => clearTimeout(t);
  }, [config]);

  const set = <K extends keyof PreWalkConfig>(k: K, v: PreWalkConfig[K]) =>
    setConfig((c) => ({ ...c, [k]: v }));

  const valid =
    config.bedrooms &&
    config.bathrooms &&
    config.garage &&
    config.pool &&
    config.spa &&
    config.fireplace &&
    config.laundry;

  const handleNext = () => {
    if (!valid) return;
    updateWalkthrough({ config, lastRoute: "/wizard/lockbox" });
    navigate({ to: "/wizard/lockbox" });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-center gap-3 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)]">
          <button
            onClick={() => router.history.back()}
            aria-label="Back"
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-secondary"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <p className="text-sm font-semibold text-muted-foreground">Step 2 of 2</p>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl space-y-7 px-4 py-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Property setup</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              These choices determine which sections appear in your walkthrough.
            </p>
          </div>

          <ChoiceGrid
            label="Number of bedrooms"
            options={["1", "2", "3", "4", "5+"]}
            value={config.bedrooms}
            onChange={(v) => set("bedrooms", v)}
            columns={5}
          />
          <ChoiceGrid
            label="Number of bathrooms"
            options={["1", "1.5", "2", "2.5", "3", "3.5", "4+"]}
            value={config.bathrooms}
            onChange={(v) => set("bathrooms", v)}
            columns={4}
          />
          <ChoiceGrid
            label="Garage"
            options={["None", "1-car", "2-car", "3-car"]}
            value={config.garage}
            onChange={(v) => set("garage", v)}
            columns={4}
          />
          <ChoiceGrid
            label="Pool?"
            options={["Yes", "No"] as const}
            value={config.pool}
            onChange={(v) => set("pool", v)}
            columns={2}
          />
          <ChoiceGrid
            label="Spa?"
            options={["Yes", "No"] as const}
            value={config.spa}
            onChange={(v) => set("spa", v)}
            columns={2}
          />
          <ChoiceGrid
            label="Fireplace?"
            options={["Yes", "No"] as const}
            value={config.fireplace}
            onChange={(v) => set("fireplace", v)}
            columns={2}
          />
          <ChoiceGrid
            label="Laundry location"
            options={["Indoor", "Outdoor", "Garage", "Closet"]}
            value={config.laundry}
            onChange={(v) => set("laundry", v)}
            columns={4}
          />
        </div>
      </main>

      <footer className="sticky bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-4 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3">
          <button
            onClick={handleNext}
            aria-disabled={!valid}
            className={cn(
              "inline-flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold transition-all",
              valid
                ? "bg-primary text-primary-foreground shadow-[var(--shadow-elevated)] hover:bg-primary/90 active:scale-[0.99]"
                : "bg-muted text-muted-foreground"
            )}
          >
            Begin Walkthrough →
          </button>
        </div>
      </footer>
    </div>
  );
}
