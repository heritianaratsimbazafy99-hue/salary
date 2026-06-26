import Link from "next/link";
import { redirect } from "next/navigation";

import { PayrollImportUploadForm } from "@/components/imports/PayrollImportUploadForm";
import { UploadStepper } from "@/components/imports/UploadStepper";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
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

  return (
    <AppShell role={actor.role}>
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Espace manager"
          title="Imports de paie"
          description="Chargez un fichier Excel pour une periode de paie et suivez les imports de votre agence."
        />

        <UploadStepper currentStep={0} />
        <PayrollImportUploadForm agencyId={actor.agencyId} />

        <section aria-labelledby="manager-imports-list-title" className="grid gap-4">
          <div>
            <h2 className="font-display text-base font-semibold" id="manager-imports-list-title">
              Derniers imports
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Les donnees affichees sont limitees a votre agence.
            </p>
          </div>

          {imports.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fichier</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Lignes</TableHead>
                  <TableHead>Erreurs</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((payrollImport) => (
                  <TableRow key={payrollImport.id}>
                    <TableCell className="max-w-72 whitespace-normal break-words font-medium text-foreground">
                      {payrollImport.sourceFilename}
                      <span className="block text-xs text-muted-foreground">
                        {formatDateTime(payrollImport.createdAt)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {payrollImport.periodStart} - {payrollImport.periodEnd}
                    </TableCell>
                    <TableCell>{payrollImport.status}</TableCell>
                    <TableCell>{payrollImport.validRowCount}</TableCell>
                    <TableCell>
                      {payrollImport.invalidRowCount + payrollImport.unknownEmployeeCount}
                    </TableCell>
                    <TableCell>
                      <Link className="text-sm font-medium text-primary underline-offset-4 hover:underline" href={`/manager/imports/${payrollImport.id}`}>
                        Ouvrir
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
              Aucun import n&apos;a encore ete charge pour votre agence.
            </p>
          )}
        </section>
      </div>
    </AppShell>
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
