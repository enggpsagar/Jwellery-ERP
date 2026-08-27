/**
 * A stable colour per person, derived from their name.
 *
 * Derived rather than stored so the same person is always the same colour —
 * in the top bar, the sidebar footer, the activity feed and any table — with
 * nothing to keep in sync. A random or index-based colour would change as
 * lists re-sort, which defeats the point of using it to recognise someone.
 *
 * Drawn from the validated jewellery chart palette so avatars sit in the same
 * colour world as the charts. These are tints of the hue over the card
 * surface with the hue itself as the text, which keeps initials legible where
 * the flat hue would not be — three of the five fall under 3:1 on white.
 *
 * Decorative only: the name is always shown or available as a tooltip, so
 * identity never rests on the colour.
 */
const AVATAR_SLOTS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
] as const;

/**
 * FNV-1a. Any stable hash would do; this one is short, has no dependencies,
 * and spreads short strings (which initials and first names are) far better
 * than summing char codes — "Amit" and "Atim" would collide under a sum.
 */
function hashString(value: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

export type AvatarColor = {
  /** Inline style for the avatar tile. */
  style: { backgroundColor: string; color: string };
  /** The raw hue, for a ring or dot alongside. */
  hue: string;
};

export function avatarColor(name?: string | null): AvatarColor {
  const key = (name ?? "").trim().toLowerCase();
  const hue = AVATAR_SLOTS[key ? hashString(key) % AVATAR_SLOTS.length : 0];

  return {
    hue,
    style: {
      backgroundColor: `color-mix(in oklab, ${hue} 14%, transparent)`,
      color: hue,
    },
  };
}

/** "Parmanand Sagar" -> "PS". Falls back to "U" for an unnamed account. */
export function initialsOf(name?: string | null): string {
  const parts = (name ?? "")
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean);

  return parts.slice(0, 2).join("").toUpperCase() || "U";
}
