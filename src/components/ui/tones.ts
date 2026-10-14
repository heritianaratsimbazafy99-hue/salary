/** Semantic colour roles shared by tiles, charts and badges. */
export type Tone = "primary" | "teal" | "accent" | "amber" | "danger" | "success" | "neutral";

/** Tinted square tile behind an icon. */
export const toneTile: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  teal: "bg-teal/12 text-teal",
  accent: "bg-accent/18 text-accent-foreground",
  amber: "bg-amber/15 text-amber-foreground",
  danger: "bg-danger/10 text-danger",
  success: "bg-success/12 text-success",
  neutral: "bg-muted text-muted-foreground",
};

/** Solid fill (bars, dots, legend swatches). */
export const toneFill: Record<Tone, string> = {
  primary: "bg-primary",
  teal: "bg-teal",
  accent: "bg-accent",
  amber: "bg-amber",
  danger: "bg-danger",
  success: "bg-success",
  neutral: "bg-muted-foreground/50",
};

/** Raw colour value for SVG strokes/fills. */
export const toneColor: Record<Tone, string> = {
  primary: "hsl(var(--primary))",
  teal: "hsl(var(--teal))",
  accent: "hsl(var(--accent))",
  amber: "hsl(var(--amber))",
  danger: "hsl(var(--danger))",
  success: "hsl(var(--success))",
  neutral: "hsl(var(--muted-foreground) / 0.5)",
};

/** Accent text colour for figures. */
export const toneText: Record<Tone, string> = {
  primary: "text-primary",
  teal: "text-teal",
  accent: "text-accent-foreground",
  amber: "text-amber-foreground",
  danger: "text-danger",
  success: "text-success",
  neutral: "text-muted-foreground",
};

const AVATAR_TONES: Tone[] = ["primary", "teal", "accent", "amber", "success"];

/** Stable tone for a name, so a person keeps the same avatar colour. */
export function toneForName(name: string): Tone {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length] ?? "primary";
}
