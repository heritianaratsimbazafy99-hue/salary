import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, CircleDashed, Eye, History, PauseCircle, Shuffle, Upload, XCircle } from "lucide-react";

type Tone = "success" | "warning" | "info" | "danger" | "neutral";

const toneClass: Record<Tone, string> = {
  success: "bg-success/12 text-success ring-success/20",
  warning: "bg-amber/15 text-amber-foreground ring-amber/30",
  info: "bg-teal/12 text-teal ring-teal/20",
  danger: "bg-danger/10 text-danger ring-danger/20",
  neutral: "bg-muted text-muted-foreground ring-border",
};

/** Known statuses mapped to a human label, semantic tone and icon. */
const STATUS_MAP: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  UPLOADED: { label: "Téléversé", tone: "neutral", icon: Upload },
  NEEDS_MAPPING: { label: "À mapper", tone: "warning", icon: Shuffle },
  READY_FOR_PREVIEW: { label: "Prêt à publier", tone: "info", icon: Eye },
  PUBLISHED: { label: "Publié", tone: "success", icon: CheckCircle2 },
  SUPERSEDED: { label: "Remplacé", tone: "neutral", icon: History },
  FAILED: { label: "Échec", tone: "danger", icon: XCircle },
  ACTIVE: { label: "Active", tone: "success", icon: CheckCircle2 },
  INACTIVE: { label: "Inactive", tone: "neutral", icon: PauseCircle },
  WARNING: { label: "À vérifier", tone: "warning", icon: AlertTriangle },
};

function prettify(raw: string) {
  return raw
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Compact status pill. Colour + icon + text label, so meaning never relies on
 * colour alone. Unknown values fall back to a neutral pill with a prettified
 * label rather than breaking.
 */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const entry = STATUS_MAP[status] ?? { label: prettify(status), tone: "neutral" as Tone, icon: CircleDashed };
  const Icon = entry.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${toneClass[entry.tone]}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label ?? entry.label}
    </span>
  );
}
