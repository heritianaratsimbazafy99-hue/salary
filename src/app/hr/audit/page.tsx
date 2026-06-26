import { AuditLogTable } from "@/components/audit/AuditLogTable";

export default function AuditPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
      <div>
        <h1 className="text-2xl font-semibold">Journal d&apos;audit</h1>
        <p className="text-sm text-muted-foreground">Suivi des actions sensibles.</p>
      </div>
      <AuditLogTable logs={[]} />
    </main>
  );
}
