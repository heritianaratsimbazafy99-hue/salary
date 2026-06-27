type Tone = "success" | "warning" | "info" | "danger" | "neutral";

const toneClass: Record<Tone, string> = {
  success: "bg-success/12 text-success",
  warning: "bg-amber/15 text-amber-foreground",
  info: "bg-teal/12 text-teal",
  danger: "bg-danger/12 text-danger",
  neutral: "bg-muted text-muted-foreground",
};

const dotClass: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-amber",
  info: "bg-teal",
  danger: "bg-danger",
  neutral: "bg-muted-foreground",
};

/** Known statuses mapped to a human label + semantic tone. */
const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  NEEDS_MAPPING: { label: "À mapper", tone: "warning" },
  READY_FOR_PREVIEW: { label: "Prêt à publier", tone: "info" },
  PUBLISHED: { label: "Publié", tone: "success" },
  FAILED: { label: "Échec", tone: "danger" },
  ACTIVE: { label: "Active", tone: "success" },
  INACTIVE: { label: "Inactive", tone: "neutral" },
};

function prettify(raw: string) {
  return raw
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Compact status pill for data tables. Colour + dot + text label, so meaning
 * never relies on colour alone. Unknown values fall back to a neutral pill with
 * a prettified label rather than breaking.
 */
export function StatusBadge({ status }: { status: string }) {
  const entry = STATUS_MAP[status] ?? { label: prettify(status), tone: "neutral" as Tone };

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${toneClass[entry.tone]}`}
    >
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dotClass[entry.tone]}`} />
      {entry.label}
    </span>
  );
}
