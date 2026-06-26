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
import { requireCanManageAgencies } from "@/lib/admin/auth";
import { createAgency, listAgencies } from "@/lib/admin/agencies";

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
  await requireCanManageAgencies();

  const agencies = await listAgencies();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <header>
        <p className="text-sm text-muted-foreground">Administration RH</p>
        <h1 className="mt-2 text-2xl font-semibold">Agences</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Creation et suivi des agences actives de la plateforme.
        </p>
      </header>

      <section aria-labelledby="create-agency-title" className="border-t border-border pt-6">
        <h2 className="text-base font-semibold" id="create-agency-title">
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
          <h2 className="text-base font-semibold" id="agencies-list-title">
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
                  <TableCell>{agency.is_active ? "Active" : "Inactive"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="rounded-md border border-border px-4 py-6 text-sm text-muted-foreground">
            Aucune agence n&apos;est encore enregistree.
          </p>
        )}
      </section>
    </main>
  );
}
