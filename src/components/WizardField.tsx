import { ChoiceGrid } from "@/components/ChoiceGrid";
import { NotesField } from "@/components/NotesField";
import { PhotoCapture } from "@/components/PhotoCapture";
import { RatingButtons } from "@/components/RatingButtons";
import { cn } from "@/lib/utils";
import {
  getAdminEditing,
  isAdminEditing,
  type Rating,
  type WizardAnswer,
} from "@/lib/walkthrough";
import type { StorageContext } from "@/lib/photo-store";
import { type QuestionDef } from "@/lib/wizard-schema";



export function getAdminStorageContext(): StorageContext | undefined {
  const a = getAdminEditing();
  if (!a) return undefined;
  return { agentId: a.agentId, walkthroughId: a.walkthroughId };
}

export function clearPoorPhotosIfNeeded(
  d: WizardAnswer,
  r: Rating | undefined,
): WizardAnswer {
  if (r === 3) return d;
  if (!d.poorPhotos && !d.poorPhotoNames) return d;
  const next = { ...d };
  delete next.poorPhotos;
  delete next.poorPhotoNames;
  return next;
}

export function LandscapeHint() {
  return (
    <p className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
      <span>📐</span>
      Hold phone in landscape (horizontal) for all photos
    </p>
  );
}


export function pickValue(q: QuestionDef, ans: WizardAnswer): unknown {
  switch (q.field) {
    case "yesno":
      return ans.bool;
    case "rating":
      return ans.rating;
    case "choice":
      return ans.choice;
    case "multichoice":
    case "bathlist":
      return ans.choices;
    case "text":
    case "longtext":
      return ans.text;
    case "number":
      return ans.number;
    default:
      return undefined;
  }
}

export function PoorPhotoSection({
  q,
  value,
  onChange,
  attempted,
}: {
  q: QuestionDef;
  value: WizardAnswer;
  onChange: (v: WizardAnswer | ((prev: WizardAnswer) => WizardAnswer)) => void;
  attempted: boolean;
}) {
  if (value.rating !== 3 || !q.poorPhotoName) return null;
  return (
    <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-200">
      <PhotoCapture
        readOnly={isAdminEditing()}
        label="Photo for Poor rating"
        photos={value.poorPhotos ?? []}
        filenames={value.poorPhotoNames ?? []}
        baseName={q.poorPhotoName}
        storageContext={getAdminStorageContext()}
        onChange={(photos, photoNames) =>
          onChange((d) => ({ ...d, poorPhotos: photos, poorPhotoNames: photoNames }))
        }
      />
    </div>
  );
}



export function FollowUpRenderer({
  q,
  value,
  onChange,
  attempted,
}: {
  q: QuestionDef;
  value: WizardAnswer;
  onChange: (v: WizardAnswer | ((prev: WizardAnswer) => WizardAnswer)) => void;
  attempted: boolean;
}) {
  const fu = q.followUp!;
  return (
    <div className="rounded-2xl border-l-4 border-accent bg-accent/5 p-4">
      <p className="mb-2 text-sm font-semibold text-foreground">{fu.label}</p>
      {fu.field === "text" && (
        <NotesField
          value={value.notes ?? ""}
          onChange={(v) => onChange((d) => ({ ...d, notes: v }))}
          placeholder="Describe location and details"
        />
      )}
      {fu.field === "photo" && (
        <PhotoCapture
          readOnly={isAdminEditing()}
          photos={value.photos ?? []}
          filenames={value.photoNames ?? []}
          baseName={fu.photoName ?? "FOLLOWUP"}
          storageContext={getAdminStorageContext()}
          onChange={(photos, photoNames) => onChange((d) => ({ ...d, photos, photoNames }))}
        />
      )}


      {fu.field === "multichoice" && (
        <div className="grid grid-cols-2 gap-2">
          {(fu.options ?? []).map((opt) => {
            const selected = (value.choices ?? []).includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  onChange((d) => {
                    const cur = d.choices ?? [];
                    return {
                      ...d,
                      choices: selected ? cur.filter((x) => x !== opt) : [...cur, opt],
                    };
                  })
                }
                className={cn(
                  "min-h-11 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all",
                  selected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card text-foreground",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function FieldRenderer({
  q,
  value,
  onChange,
  attempted,
  suppressRating = false,
  suppressChoice = false,
  inlinePhotoLabel = false,
  labelColor,
}: {
  q: QuestionDef;
  value: WizardAnswer;
  onChange: (v: WizardAnswer | ((prev: WizardAnswer) => WizardAnswer)) => void;
  attempted: boolean;
  suppressRating?: boolean;
  suppressChoice?: boolean;
  /** When true, photo/video fields render their own inline label+button row. */
  inlinePhotoLabel?: boolean;
  labelColor?: string;
}) {
  // All required-field validation has been disabled app-wide. Fields never
  // render error styles, asterisks, or "required" hints.
  void attempted;


  switch (q.field) {
    case "text":
      return (
        <>
          <input
            value={value.text ?? ""}
            onChange={(e) => onChange((d) => ({ ...d, text: e.target.value }))}
            placeholder={q.helper ?? ""}
            className={cn(
              "h-12 w-full rounded-xl border-2 bg-card px-4 text-base text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
              "border-input",
            )}
          />
          {q.withRating && !suppressRating && (
            <div className="mt-3">
              <p className="mb-2 text-sm font-semibold text-foreground">Condition rating</p>
              <RatingButtons
                value={value.rating}
                onChange={(r: Rating) =>
                  onChange((d) => clearPoorPhotosIfNeeded({ ...d, rating: r }, r))
                }
              />
            </div>
          )}
          {q.withRating && (
            <PoorPhotoSection q={q} value={value} onChange={onChange} attempted={false} />
          )}
        </>
      );

    case "longtext":
      return (
        <NotesField
          value={value.text ?? ""}
          onChange={(v) => onChange((d) => ({ ...d, text: v }))}
          placeholder={q.helper ?? ""}
        />
      );

    case "number":
      return (
        <input
          type="number"
          inputMode="numeric"
          value={value.number ?? ""}
          onChange={(e) => {
            const n = e.target.value === "" ? undefined : Number(e.target.value);
            onChange((d) => ({ ...d, number: n }));
          }}
          className={cn(
            "h-12 w-full rounded-xl border-2 bg-card px-4 text-base text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30",
            "border-input",
          )}
        />
      );

    case "yesno":
      return (
        <div className="grid grid-cols-2 gap-3">
          {(["Yes", "No"] as const).map((label) => {
            const isYes = label === "Yes";
            const selected = value.bool === isYes;
            return (
              <button
                key={label}
                type="button"
                onClick={() => onChange((d) => ({ ...d, bool: isYes }))}
                className={cn(
                  "min-h-12 rounded-xl border-2 px-4 py-2.5 text-base font-semibold transition-all active:scale-95",
                  selected
                    ? "border-accent bg-accent text-accent-foreground shadow-[var(--shadow-soft)]"
                    : "border-border bg-card text-foreground hover:border-accent/40",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      );

    case "choice":
      return (
        <>
          {!suppressChoice && (
            <ChoiceGrid
              label=""
              options={q.options ?? []}
              value={value.choice}
              onChange={(v) => onChange((d) => ({ ...d, choice: v }))}
              columns={Math.min(q.options?.length ?? 2, 4)}
            />
          )}
          {q.withRating && !suppressRating && (
            <div className="mt-3">
              <p className="mb-2 text-sm font-semibold text-foreground">Condition rating</p>
              <RatingButtons
                value={value.rating}
                onChange={(r: Rating) =>
                  onChange((d) => clearPoorPhotosIfNeeded({ ...d, rating: r }, r))
                }
              />
            </div>
          )}
          {q.withRating && (
            <PoorPhotoSection q={q} value={value} onChange={onChange} attempted={false} />
          )}
        </>
      );

    case "multichoice": {
      const selected = value.choices ?? [];
      return (
        <div className="grid grid-cols-2 gap-2">
          {(q.options ?? []).map((opt) => {
            const isOn = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  onChange((d) => {
                    const cur = d.choices ?? [];
                    return {
                      ...d,
                      choices: isOn ? cur.filter((x) => x !== opt) : [...cur, opt],
                    };
                  })
                }
                className={cn(
                  "min-h-11 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all active:scale-95",
                  isOn
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card text-foreground hover:border-accent/40",
                )}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );
    }

    case "bathlist": {
      const items = value.choices ?? [];
      const types = ["Full", "3/4", "Half"] as const;
      return (
        <div className="space-y-3">
          {items.length > 0 && (
            <ol className="space-y-2">
              {items.map((label, i) => (
                <li
                  key={`${label}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-xl border-2 border-border bg-card px-4 py-2.5"
                >
                  <span className="text-base font-semibold text-foreground">
                    {i + 1}. {label} bath
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      onChange((d) => ({
                        ...d,
                        choices: (d.choices ?? []).filter((_, j) => j !== i),
                      }))
                    }
                    className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-critical hover:bg-critical/10"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ol>
          )}
          <div>
            <p className="mb-2 text-sm font-semibold text-foreground">
              Add bathroom #{items.length + 1}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() =>
                    onChange((d) => ({ ...d, choices: [...(d.choices ?? []), t] }))
                  }
                  className="min-h-12 rounded-xl border-2 border-border bg-card px-3 py-2 text-base font-semibold text-foreground transition-all hover:border-accent/40 active:scale-95"
                >
                  + {t}
                </button>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case "rating":
      return (
        <>
          {!suppressRating && (
            <RatingButtons
              value={value.rating}
              onChange={(r) =>
                onChange((d) => clearPoorPhotosIfNeeded({ ...d, rating: r }, r))
              }
            />
          )}
          {q.withPhoto && (
            <div className="mt-3">
              <PhotoCapture
                readOnly={isAdminEditing()}
                label="Photo"
                photos={value.photos ?? []}
                filenames={value.photoNames ?? []}
                baseName={q.withPhoto.name}
                storageContext={getAdminStorageContext()}
                onChange={(photos, photoNames) =>
                  onChange((d) => ({ ...d, photos, photoNames }))
                }
              />
            </div>
          )}
          <PoorPhotoSection q={q} value={value} onChange={onChange} attempted={false} />
        </>
      );

    case "photo":
    case "video": {
      const isVideo = q.field === "video";
      return (
        <PhotoCapture
          readOnly={isAdminEditing()}
          label={inlinePhotoLabel ? q.label : undefined}
          labelColor={labelColor}
          photos={value.photos ?? []}
          filenames={value.photoNames ?? []}
          baseName={q.photoName ?? q.id.toUpperCase()}
          isVideo={isVideo}
          storageContext={getAdminStorageContext()}
          onChange={(photos, photoNames) => onChange((d) => ({ ...d, photos, photoNames }))}
        />
      );
    }

  }

}
