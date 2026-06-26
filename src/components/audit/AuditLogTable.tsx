import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

type AuditLog = {
  id: string;
  actorRole: string | null;
  action: string;
  resourceType: string;
  createdAt: string;
};

export function AuditLogTable({ logs }: { logs: AuditLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted-foreground">
        Aucun evenement d&apos;audit.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Ressource</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.map((log) => (
          <TableRow key={log.id}>
            <TableCell>
              <time dateTime={log.createdAt}>{log.createdAt}</time>
            </TableCell>
            <TableCell>{log.actorRole ?? "Systeme"}</TableCell>
            <TableCell>{log.action}</TableCell>
            <TableCell>{log.resourceType}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
