import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FileSpreadsheet,
  FileUp,
  History,
  Inbox,
  Layers,
  Rows3,
  UploadCloud,
} from "lucide-react";
import { redirect } from "next/navigation";

import { PayrollImportUploadForm } from "@/components/imports/PayrollImportUploadForm";
import { UploadStepper } from "@/components/imports/UploadStepper";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { HeaderStat, PageHeader } from "@/components/shell/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState, Panel } from "@/components/ui/Surface";
import { getCurrentAgencyScopedActor } from "@/lib/admin/auth";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
  assertCanManagePayrollForAgency,
} from "@/lib/admin/permissions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ImportListRow = {
  created_at?: unknown;
  id?: unknown;
  invalid_row_count?: unknown;
  period_end?: unknown;
  period_start?: unknown;
  source_filename?: unknown;
  status?: unknown;
  unknown_employee_count?: unknown;
  valid_row_count?: unknown;
};

type ManagerImportListItem = {
  createdAt: string;
  id: string;
  invalidRowCount: number;
  periodEnd: string;
  periodStart: string;
  sourceFilename: string;
  status: string;
  unknownEmployeeCount: number;
  validRowCount: number;
};

export default async function ManagerImportsPage() {
  const actor = await requireManagerActor();
  if (!actor) return <ForbiddenManagerAccess />;

  const supabase = await createClient();
  const imports = await loadManagerImports(supabase, actor.agencyId);

  const toProcess = imports.filter((item) => item.status === "NEEDS_MAPPING" || item.status === "READY_FOR_PREVIEW").length;
  const published = imports.filter((item) => item.status === "PUBLISHED").length;
  const validRows = imports.reduce((sum, item) => sum + item.validRowCount, 0);

  return (
    <AppShell role={actor.role}>
      <div className="flex flex-col gap-6 sm:gap-8">
        <PageHeader
          eyebrow="Espace manager"
          title="Imports de paie"
          icon={FileUp}
          description="Chargez un fichier Excel pour une periode de paie et suivez les imports de votre agence."
          actions={
            <Link className={buttonClasses({ variant: "secondary" })} href="/api/payroll-template" prefetch={false}>
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              Modèle Excel
            </Link>
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <HeaderStat icon={Layers} label="Imports" value={imports.length} />
            <HeaderStat icon={CircleAlert} label="À traiter" value={toProcess} />
            <HeaderStat icon={CheckCircle2} label="Publiés" value={published} />
            <HeaderStat icon={Rows3} label="Lignes valides" value={validRows.toLocaleString("fr-MG")} />
          </div>
        </PageHeader>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <Panel
            icon={UploadCloud}
            title="Nouvel import"
            description="Trois étapes : choisissez la période, déposez le fichier, puis contrôlez le rapport avant publication."
          >
            <div className="grid gap-5">
              <UploadStepper bare currentStep={0} />
              <PayrollImportUploadForm agencyId={actor.agencyId} />
            </div>
          </Panel>

          <Panel
            icon={History}
            tone="teal"
            title="Derniers imports"
            titleId="manager-imports-list-title"
            description="Les donnees affichees sont limitees a votre agence."
          >
            {imports.length > 0 ? (
              <ul className="stagger grid grid-cols-1 gap-3">
                {imports.map((payrollImport) => (
                  <ImportCard key={payrollImport.id} item={payrollImport} />
                ))}
              </ul>
            ) : (
              <EmptyState
                headingLevel={3}
                icon={Inbox}
                title="Aucun import"
                description="Aucun import n'a encore ete charge pour votre agence."
              />
            )}
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

const NEXT_STEP: Record<string, string> = {
  NEEDS_MAPPING: "Classez les colonnes inconnues",
  READY_FOR_PREVIEW: "Vérifiez puis publiez",
  PUBLISHED: "Fiches en ligne",
  SUPERSEDED: "Remplacé par un import plus récent",
  FAILED: "Import à recommencer",
  UPLOADED: "Analyse en cours",
};

function ImportCard({ item }: { item: ManagerImportListItem }) {
  const errors = item.invalidRowCount + item.unknownEmployeeCount;
  const total = item.validRowCount + errors;
  const needsAction = item.status === "NEEDS_MAPPING" || item.status === "READY_FOR_PREVIEW";

  return (
    <li
      className={`group relative rounded-2xl border bg-surface p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] ${
        needsAction ? "border-amber/40 bg-amber/[0.03]" : "border-border"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success">
          <FileSpreadsheet className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 break-all text-sm font-semibold text-foreground">{item.sourceFilename}</p>
            <StatusBadge status={item.status} />
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden="true" />
              {item.periodStart} - {item.periodEnd}
            </span>
            <span>{formatDateTime(item.createdAt)}</span>
          </p>
          <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="chart-bar h-full bg-success" style={{ width: `${total ? (item.validRowCount / total) * 100 : 0}%` }} />
            <span className="chart-bar h-full bg-danger/70" style={{ width: `${total ? (errors / total) * 100 : 0}%` }} />
          </div>
          <p className={`mt-2 text-xs font-semibold ${needsAction ? "text-amber-foreground" : "text-muted-foreground"}`}>
            {NEXT_STEP[item.status] ?? ""}
          </p>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">
              <span className="font-semibold text-success">{item.validRowCount}</span> lignes valides ·{" "}
              <span className={`font-semibold ${errors ? "text-danger" : "text-muted-foreground"}`}>{errors}</span> erreur(s)
            </span>
            <Link
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-primary transition-colors after:absolute after:inset-0 after:rounded-2xl hover:bg-primary/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              href={`/manager/imports/${item.id}`}
            >
              Ouvrir
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </li>
  );
}

async function requireManagerActor() {
  try {
    const actor = await getCurrentAgencyScopedActor();
    assertCanManagePayrollForAgency({
      actorAgencyId: actor.agencyId,
      requestedAgencyId: actor.agencyId,
      role: actor.role,
    });

    return actor;
  } catch (error) {
    if (hasErrorMessage(error, AUTH_REQUIRED_ERROR_MESSAGE)) {
      redirect("/auth/login");
    }

    if (hasErrorMessage(error, FORBIDDEN_ERROR_MESSAGE)) {
      return null;
    }

    throw error;
  }
}

async function loadManagerImports(
  supabase: { from: (table: string) => unknown },
  agencyId: string,
): Promise<ManagerImportListItem[]> {
  const query = supabase.from("payroll_imports") as {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (
          column: string,
          options: { ascending: boolean },
        ) => { limit: (count: number) => Promise<{ data: unknown; error: unknown }> };
      };
    };
  };
  const { data, error } = await query
    .select(
      "id,period_start,period_end,status,source_filename,valid_row_count,invalid_row_count,unknown_employee_count,created_at",
    )
    .eq("agency_id", agencyId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    throw new Error("Impossible de charger les imports.");
  }

  return ((data ?? []) as ImportListRow[]).flatMap((row): ManagerImportListItem[] => {
    if (
      typeof row.id !== "string" ||
      typeof row.period_start !== "string" ||
      typeof row.period_end !== "string" ||
      typeof row.status !== "string" ||
      typeof row.source_filename !== "string"
    ) {
      return [];
    }

    return [
      {
        createdAt: typeof row.created_at === "string" ? row.created_at : "",
        id: row.id,
        invalidRowCount: toCount(row.invalid_row_count),
        periodEnd: row.period_end,
        periodStart: row.period_start,
        sourceFilename: row.source_filename,
        status: row.status,
        unknownEmployeeCount: toCount(row.unknown_employee_count),
        validRowCount: toCount(row.valid_row_count),
      },
    ];
  });
}

function ForbiddenManagerAccess() {
  return <AccessDenied context="Espace manager" />;
}

function hasErrorMessage(error: unknown, message: string): error is Error {
  return error instanceof Error && error.message === message;
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function formatDateTime(value: string): string {
  if (!value) return "Date inconnue";

  return new Intl.DateTimeFormat("fr-MG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
