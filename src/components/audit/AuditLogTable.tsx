import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Building2,
  Download,
  Eye,
  FileUp,
  KeyRound,
  Mail,
  PencilLine,
  Rocket,
  ScrollText,
  UserCog,
  UserX,
} from "lucide-react";

import { formatTime } from "@/components/ui/format";
import { EmptyState } from "@/components/ui/Surface";
import { toneTile, type Tone } from "@/components/ui/tones";

type AuditLog = {
  id: string;
  actorRole: string | null;
  action: string;
  resourceType: string;
  createdAt: string;
};

const ROLE_TONE: Record<string, Tone> = {
  employee: "teal",
  agency_manager: "primary",
  hr_central: "accent",
  super_admin: "amber",
};

/** Human description + icon for an audit action code (raw code stays visible). */
export function describeAuditAction(action: string): { title: string; icon: LucideIcon; tone: Tone } {
  const rules: Array<[RegExp, string, LucideIcon, Tone]> = [
    [/PUBLISH/, "Publication de fiches", Rocket, "success"],
    [/EXPORT/, "Export de données", Download, "teal"],
    [/ANALYTICS/, "Consultation des analyses", BarChart3, "primary"],
    [/VIEW|READ/, "Consultation", Eye, "primary"],
    [/ADJUST|CORRECT/, "Correction manuelle", PencilLine, "amber"],
    [/AGENCY/, "Modification d'agence", Building2, "primary"],
    [/DISABLE|REVOKE|DEACTIVAT/, "Accès retiré", UserX, "danger"],
    [/MANAGER|USER|PROFILE|ACCESS/, "Gestion des accès", UserCog, "primary"],
    [/INVIT|NOTIF|EMAIL/, "Envoi d'emails", Mail, "teal"],
    [/LOGIN|AUTH|SESSION/, "Connexion", KeyRound, "neutral"],
    [/IMPORT/, "Import de paie", FileUp, "primary"],
    [/MONITOR|SMOKE|SENTRY/, "Test de supervision", Activity, "neutral"],
  ];
  const match = rules.find(([pattern]) => pattern.test(action));
  return match
    ? { title: match[1], icon: match[2], tone: match[3] }
    : { title: "Action enregistrée", icon: ScrollText, tone: "neutral" };
}

function dayKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString().slice(0, 10);
}

function dayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date);
}

/** Audit journal rendered as a day-grouped timeline. */
export function AuditLogTable({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return (
      <EmptyState icon={ScrollText} title="Aucun evenement d'audit." description="Les actions sensibles apparaîtront ici dès qu'elles seront réalisées." />
    );
  }

  const groups = new Map<string, AuditLog[]>();
  for (const log of logs) {
    const key = dayKey(log.createdAt);
    groups.set(key, [...(groups.get(key) ?? []), log]);
  }

  return (
    <div className="grid gap-6">
      {[...groups.entries()].map(([key, entries]) => (
        <section aria-label={dayLabel(entries[0]!.createdAt)} key={key}>
          <p className="sticky top-16 z-10 mb-3 inline-flex rounded-full border border-border bg-surface/90 px-3 py-1 text-xs font-bold text-muted-foreground shadow first-letter:uppercase-[var(--shadow-xs)] backdrop-blur lg:top-2">
            {dayLabel(entries[0]!.createdAt)}
          </p>
          <ol className="relative grid gap-3 pl-6 before:absolute before:bottom-3 before:left-[0.6875rem] before:top-3 before:w-px before:bg-border">
            {entries.map((log) => {
              const meta = describeAuditAction(log.action);
              return (
                <li className="relative" key={log.id}>
                  <span aria-hidden="true" className="absolute -left-6 top-5 size-2.5 rounded-full border-2 border-surface bg-primary/50 ring-2 ring-border" />
                  <article className="flex flex-wrap items-start gap-3 rounded-2xl border border-border/80 bg-surface p-4 shadow-[var(--shadow-xs)] transition hover:shadow-[var(--shadow-sm)]">
                    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${toneTile[meta.tone]}`}>
                      <meta.icon className="size-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-display text-sm font-semibold">{meta.title}</h3>
                        <time className="text-xs font-medium tabular-nums text-muted-foreground" dateTime={log.createdAt}>
                          {formatTime(log.createdAt)}
                        </time>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="inline-flex items-center rounded-md bg-primary/[0.06] px-2 py-0.5 font-mono font-medium text-primary">
                          {log.action}
                        </span>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-semibold ${toneTile[ROLE_TONE[log.actorRole ?? ""] ?? "neutral"]}`}>
                          {log.actorRole ?? "Systeme"}
                        </span>
                        <span className="inline-flex items-center rounded-md px-2 py-0.5 font-mono text-muted-foreground ring-1 ring-border">
                          {log.resourceType}
                        </span>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
