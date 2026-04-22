import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { loadWalkthrough, updateWalkthrough, type PropertyAddress } from "@/lib/walkthrough";

export const Route = createFileRoute("/_app/address")({
  component: AddressScreen,
});

function AddressScreen() {
  const navigate = useNavigate();
  const router = useRouter();
  const [address, setAddress] = useState<PropertyAddress>({
    houseNumber: "",
    streetName: "",
    city: "",
  });
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const w = loadWalkthrough();
    if (w) setAddress(w.address);
  }, []);

  // Auto-save on each keystroke
  useEffect(() => {
    const t = setTimeout(() => {
      if (loadWalkthrough()) updateWalkthrough({ address, lastRoute: "/address" });
    }, 200);
    return () => clearTimeout(t);
  }, [address]);

  const valid =
    address.houseNumber.trim() && address.streetName.trim() && address.city.trim();

  const handleNext = () => {
    if (!valid) {
      setAttempted(true);
      return;
    }
    updateWalkthrough({ address, lastRoute: "/config" });
    navigate({ to: "/config" });
  };

  const fieldClass = (val: string) =>
    cn(
      "h-14 w-full rounded-2xl border-2 bg-card px-4 text-base text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
      attempted && !val.trim() ? "field-error" : "border-input"
    );

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
          <p className="text-sm font-semibold text-muted-foreground">Step 1 of 2</p>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-2xl px-4 py-6">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Property address</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We'll use this to label your walkthrough folder.
          </p>

          <div className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                House number
              </label>
              <input
                inputMode="numeric"
                autoComplete="off"
                placeholder="1234"
                value={address.houseNumber}
                onChange={(e) => setAddress((a) => ({ ...a, houseNumber: e.target.value }))}
                className={fieldClass(address.houseNumber)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">
                Street name
              </label>
              <input
                autoComplete="off"
                placeholder="Sunset Boulevard"
                value={address.streetName}
                onChange={(e) => setAddress((a) => ({ ...a, streetName: e.target.value }))}
                className={fieldClass(address.streetName)}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-foreground">City</label>
              <input
                autoComplete="off"
                placeholder="Los Angeles"
                value={address.city}
                onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                className={fieldClass(address.city)}
              />
            </div>
          </div>
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
            Continue →
          </button>
        </div>
      </footer>
    </div>
  );
}
