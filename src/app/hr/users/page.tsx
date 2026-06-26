import { revalidatePath } from "next/cache";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { listAgencies } from "@/lib/admin/agencies";
import { createAgencyManager } from "@/lib/admin/users";

export const dynamic = "force-dynamic";

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

async function createAgencyManagerAction(formData: FormData) {
  "use server";

  await createAgencyManager({
    agencyId: formText(formData, "agencyId"),
    email: formText(formData, "email"),
    fullName: formText(formData, "fullName"),
  });

  revalidatePath("/hr/users");
}

export default async function UsersPage() {
  const agencies = await listAgencies();
  const hasAgencies = agencies.length > 0;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <header>
        <p className="text-sm text-muted-foreground">Administration RH</p>
        <h1 className="mt-2 text-2xl font-semibold">Responsables d&apos;agence</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Creation des responsables et affectation a une agence active.
        </p>
      </header>

      <section aria-labelledby="create-manager-title" className="border-t border-border pt-6">
        <h2 className="text-base font-semibold" id="create-manager-title">
          Nouveau responsable
        </h2>
        <form action={createAgencyManagerAction} className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr_16rem_auto] lg:items-end">
          <Input
            autoComplete="email"
            label="Email professionnel"
            name="email"
            placeholder="responsable@example.com"
            required
            type="email"
          />
          <Input
            autoComplete="name"
            label="Nom complet"
            name="fullName"
            placeholder="Responsable Agence"
            required
          />
          <div className="grid gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="agencyId">
              Agence
            </label>
            <select
              className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
              disabled={!hasAgencies}
              id="agencyId"
              name="agencyId"
              required
            >
              {hasAgencies ? (
                <>
                  <option value="">Selectionner</option>
                  {agencies.map((agency) => (
                    <option key={agency.id} value={agency.id}>
                      {agency.name} ({agency.code})
                    </option>
                  ))}
                </>
              ) : (
                <option value="">Aucune agence</option>
              )}
            </select>
          </div>
          <Button disabled={!hasAgencies} type="submit">
            Creer
          </Button>
        </form>
        {!hasAgencies ? (
          <p className="mt-4 rounded-md border border-border px-4 py-3 text-sm text-muted-foreground">
            Creez d&apos;abord une agence avant d&apos;ajouter un responsable.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="agency-reference-title" className="grid gap-4">
        <div>
          <h2 className="text-base font-semibold" id="agency-reference-title">
            Agences disponibles
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Reference rapide pour choisir l&apos;affectation du responsable.
          </p>
        </div>

        {hasAgencies ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agence</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agencies.map((agency) => (
                <TableRow key={agency.id}>
                  <TableCell className="font-medium text-foreground">{agency.name}</TableCell>
                  <TableCell>{agency.code}</TableCell>
                  <TableCell>{agency.is_active ? "Active" : "Inactive"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="rounded-md border border-border px-4 py-6 text-sm text-muted-foreground">
            Aucune agence n&apos;est encore disponible pour affectation.
          </p>
        )}
      </section>
    </main>
  );
}
