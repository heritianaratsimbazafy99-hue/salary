import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { requireCanManageAgencies } from "@/lib/admin/auth";
import { createAgency, listAgencies } from "@/lib/admin/agencies";
import {
  AUTH_REQUIRED_ERROR_MESSAGE,
  FORBIDDEN_ERROR_MESSAGE,
} from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function createAgencyAction(formData: FormData) {
  "use server";

  await createAgency({
    code: formText(formData, "code"),
    name: formText(formData, "name"),
  });

  revalidatePath("/hr/agencies");
  revalidatePath("/hr/users");
}

export default async function AgenciesPage() {
  let role: Awaited<ReturnType<typeof requireCanManageAgencies>>;

  try {
    role = await requireCanManageAgencies();
  } catch (error) {
    if (hasErrorMessage(error, AUTH_REQUIRED_ERROR_MESSAGE)) {
      redirect("/auth/login");
    }

    if (hasErrorMessage(error, FORBIDDEN_ERROR_MESSAGE)) {
      return <ForbiddenAgenciesAccess />;
    }

    throw error;
  }

  const agencies = await listAgencies();

  return (
    <AppShell role={role}>
      <div className="flex flex-col gap-8">
        <PageHeader
          eyebrow="Administration RH"
          title="Agences"
          description="Creation et suivi des agences actives de la plateforme."
        />

        <section aria-labelledby="create-agency-title" className="rounded-2xl border border-border bg-surface p-6 shadow-[var(--shadow-xs)]">
          <h2 className="font-display text-base font-semibold" id="create-agency-title">
            Nouvelle agence
          </h2>
          <form action={createAgencyAction} className="mt-4 grid gap-4 md:grid-cols-[1fr_12rem_auto] md:items-end">
            <Input
              autoComplete="organization"
              label="Nom de l'agence"
              name="name"
              placeholder="Agence Antananarivo"
              required
            />
            <Input
              autoCapitalize="characters"
              label="Code"
              maxLength={32}
              name="code"
              placeholder="TNR"
              required
            />
            <Button type="submit">Creer</Button>
          </form>
        </section>

        <section aria-labelledby="agencies-list-title" className="grid gap-4">
          <div>
            <h2 className="font-display text-base font-semibold" id="agencies-list-title">
              Liste des agences
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Les responsables d&apos;agence seront rattaches a ces agences.
            </p>
          </div>

          {agencies.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nom</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agencies.map((agency) => (
                  <TableRow key={agency.id}>
                    <TableCell className="font-medium text-foreground">{agency.name}</TableCell>
                    <TableCell>{agency.code}</TableCell>
                    <TableCell>
                      <StatusBadge status={agency.is_active ? "ACTIVE" : "INACTIVE"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
              Aucune agence n&apos;est encore enregistree.
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ForbiddenAgenciesAccess() {
  return <AccessDenied context="Administration RH" />;
}

function hasErrorMessage(error: unknown, message: string): error is Error {
  return error instanceof Error && error.message === message;
}
