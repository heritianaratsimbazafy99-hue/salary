import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, BarChart3, CalendarDays, ScrollText, Users } from "lucide-react";

import { AuditLogTable } from "@/components/audit/AuditLogTable";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { ColumnChart } from "@/components/ui/Charts";
import { Panel } from "@/components/ui/Surface";
import { buttonClasses } from "@/components/ui/Button";
import { requireCanReadPayrollAnalytics } from "@/lib/admin/auth";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
} from "@/lib/admin/permissions";
import { loadRecentAuditLogs, type AuditDomain } from "@/lib/audit/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams?: Promise<{ domain?: string }> } = {}) {
  let actor: Awaited<ReturnType<typeof requireCanReadPayrollAnalytics>>;

  try {
    actor = await requireCanReadPayrollAnalytics();
  } catch (error) {
    if (hasErrorMessage(error, AUTH_REQUIRED_ERROR_MESSAGE)) {
      redirect("/auth/login");
    }

    if (hasErrorMessage(error, FORBIDDEN_ERROR_MESSAGE)) {
      return <ForbiddenAuditAccess />;
    }

    throw error;
  }

  const params = await searchParams ?? {};
  const domain: AuditDomain | undefined = params.domain === "hr" || params.domain === "other" ? params.domain : undefined;
  const supabase = await createClient();
  const logs = await loadRecentAuditLogs(supabase, 50, domain);

  const roles = new Set(logs.map((log) => log.actorRole ?? "system")).size;
  const perDay = new Map<string, number>();
  for (const log of logs) {
    const key = log.createdAt.slice(0, 10);
    perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const activity = [...perDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-10)
    .map(([day, value], index, days) => ({
      highlight: index === days.length - 1,
      key: day,
      label: new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`)),
      value,
      valueLabel: String(value),
    }));

  return (
    <AppShell role={actor.role}>
      <div className="flex flex-col gap-6 sm:gap-8">
        <PageHeader
          eyebrow="Administration RH"
          title="Journal d'audit"
          icon={ScrollText}
          description="Suivi des actions sensibles réalisées sur la plateforme."
        >
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <HeaderStat icon={Activity} label="Événements" value={logs.length} />
            <HeaderStat icon={Users} label="Rôles actifs" value={roles} />
            <HeaderStat icon={CalendarDays} label="Jours couverts" value={activity.length} />
          </div>
        </PageHeader>
        <nav aria-label="Filtrer le journal" className="flex flex-wrap gap-2">
          {([[undefined, "Tout"], ["hr", "Ressources humaines"], ["other", "Paie et accès"]] as const).map(([value, label]) => (
            <Link key={label} aria-current={domain === value ? "page" : undefined} className={buttonClasses({ variant: domain === value ? "primary" : "secondary", size: "sm" })} href={value ? `/hr/audit?domain=${value}` : "/hr/audit"}>{label}</Link>
          ))}
        </nav>
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 xl:order-2 xl:sticky xl:top-8">
            {activity.length > 1 ? (
              <Panel icon={BarChart3} tone="teal" title="Activité" description="Événements par jour (50 derniers).">
                <ColumnChart
                  label={`Activité sur ${activity.length} jours, maximum ${Math.max(...activity.map((day) => day.value))} événements par jour.`}
                  tone="teal"
                  data={activity}
                />
              </Panel>
            ) : null}
          </div>
          <div className="min-w-0 xl:order-1">
            <AuditLogTable logs={logs} />
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ForbiddenAuditAccess() {
  return <AccessDenied context="Administration RH" />;
}

function hasErrorMessage(error: unknown, message: string): error is Error {
  return error instanceof Error && error.message === message;
}
