import Link from "next/link";
import { UserPlus } from "lucide-react";
import { getAgencyPageActor } from "@/components/agency-employees/PageAccess";
import { AccessDenied } from "@/components/shell/AccessDenied";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Panel } from "@/components/ui/Surface";
import { Input } from "@/components/ui/Input";
import { Button, buttonClasses } from "@/components/ui/Button";
import { AdminForm } from "@/lib/admin/AdminForm";
import { createEmployeeAction } from "../actions";
export const dynamic = "force-dynamic";
export default async function NewAgencyEmployeePage() {
  const actor = await getAgencyPageActor(); if (!actor) return <AccessDenied context="Salariés de l’agence" />;
  return <AppShell role={actor.role}><div className="grid gap-6"><PageHeader title="Nouveau salarié" eyebrow="Mon agence" icon={UserPlus} description="Créez une identité indépendante de la paie. Le dossier RH pourra être complété ensuite." actions={<Link href="/manager/employees" className={buttonClasses({ variant: "secondary" })}>Retour aux salariés</Link>} />
    <Panel title="Identité du salarié" description="Vérifiez le matricule, le nom et l’adresse de connexion avant de créer la fiche. Aucune invitation n’est envoyée automatiquement.">
      <AdminForm action={createEmployeeAction} label="Créer un salarié" className="grid gap-4 sm:grid-cols-2">
        <Input name="matricule" label="Matricule" required maxLength={80} hint="Les lettres a–z sont enregistrées en majuscules." />
        <Input name="fullName" label="Nom complet" required maxLength={160} />
        <Input name="email" label="Email de connexion" type="email" required maxLength={254} />
        <div className="sm:col-span-2"><Button type="submit">Créer le salarié</Button></div>
      </AdminForm>
    </Panel></div></AppShell>;
}
