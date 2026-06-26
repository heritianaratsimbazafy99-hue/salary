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
    return <p className="text-sm text-muted-foreground">Aucun evenement d&apos;audit.</p>;
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
            <TableCell>{log.createdAt}</TableCell>
            <TableCell>{log.actorRole}</TableCell>
            <TableCell>{log.action}</TableCell>
            <TableCell>{log.resourceType}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
