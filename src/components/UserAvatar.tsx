import { useMemo, useState } from "react";

function initialsFor(name?: string | null, email?: string | null): string {
  const src = (name?.trim() || email?.split("@")[0] || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  const letters =
    parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : src.slice(0, 2);
  return letters.toUpperCase();
}

const SIZE_CLASSES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-16 w-16 text-xl",
  "2xl": "h-[100px] w-[100px] text-3xl",
} as const;

export type AvatarSize = keyof typeof SIZE_CLASSES;

interface Props {
  url?: string | null;
  name?: string | null;
  email?: string | null;
  size?: AvatarSize;
  className?: string;
  /** Use muted (gray) background instead of primary navy. */
  muted?: boolean;
}

/**
 * Circular avatar that displays the user's photo, falling back to initials
 * on a colored background. Never shows a broken image — image errors trigger
 * the initials fallback.
 */
export function UserAvatar({ url, name, email, size = "md", className = "", muted = false }: Props) {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(url) && !errored;
  const initials = useMemo(() => initialsFor(name, email), [name, email]);

  const sizeCls = SIZE_CLASSES[size];
  const toneCls = muted
    ? "bg-muted text-foreground/70 ring-1 ring-border"
    : "bg-primary text-primary-foreground";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ${sizeCls} ${toneCls} ${className}`}
      aria-label={name || email || "User"}
    >
      {showImage ? (
        <img
          src={url ?? undefined}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
          loading="lazy"
          draggable={false}
        />
      ) : (
        <span aria-hidden>{initials}</span>
      )}
    </span>
  );
}
