import { AuditLogTable } from "@/components/audit/AuditLogTable";

export default function AuditPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <header>
        <p className="text-sm text-muted-foreground">Administration RH</p>
        <h1 className="mt-2 text-2xl font-semibold">Journal d&apos;audit</h1>
        <p className="mt-2 text-sm text-muted-foreground">Suivi des actions sensibles.</p>
      </header>
      <AuditLogTable logs={[]} />
    </main>
  );
}
