import { Building2, Layers, MapPin } from "lucide-react";
import { Panel } from "@/components/ui/Surface";
import type { CurrentHrScope } from "@/lib/hr/access";

/** Read-only summary of the signed-in scoped user's agency, sites and departments. */
export function ScopeSummary({ scope }: { scope: CurrentHrScope }) {
  const list = (items: string[], empty: string) => items.length
    ? <ul className="flex flex-wrap gap-2">{items.map((item) => <li key={item} className="rounded-full bg-muted px-3 py-1 text-sm font-medium">{item}</li>)}</ul>
    : <p className="text-sm text-muted-foreground">{empty}</p>;
  return <Panel icon={Building2} tone="primary" title="Votre périmètre" titleId="scope" description={scope.agency?.name ?? "Agence"}>
    <div className="grid gap-5 md:grid-cols-2">
      <div className="grid content-start gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="size-4" aria-hidden="true" />Sites</h3>
        {list(scope.sites.map((site) => `${site.name} (${site.code})`), "Tous les sites de vos départements.")}</div>
      {scope.actor.role === "team_manager" ? <div className="grid content-start gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><Layers className="size-4" aria-hidden="true" />Départements</h3>
        {list(scope.departments.map((department) => department.name), "Tous les départements de vos sites.")}</div> : null}
    </div>
  </Panel>;
}
