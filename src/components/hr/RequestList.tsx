import { MessageSquareText } from "lucide-react";
import { formatDay } from "@/components/ui/format";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/Surface";
import { REQUEST_CATEGORY_LABEL, REQUEST_STATUS_BADGE, REQUEST_STATUS_LABEL, type HrRequest } from "@/lib/hr/requests";

export function RequestList({ requests, showEmployee = false, renderActions, emptyTitle = "Aucune demande." }: {
  requests: HrRequest[]; showEmployee?: boolean; renderActions?: (request: HrRequest) => React.ReactNode; emptyTitle?: string;
}) {
  if (!requests.length) return <EmptyState icon={MessageSquareText} headingLevel={3} title={emptyTitle} />;
  return <ul className="grid gap-3">{requests.map((request) => <li key={request.id} className="grid gap-3 rounded-2xl border border-border bg-surface p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 [overflow-wrap:anywhere]"><p className="font-semibold">{request.subject}</p>
        <p className="text-xs text-muted-foreground">{REQUEST_CATEGORY_LABEL[request.category]} · {formatDay(request.created_at.slice(0, 10))}{showEmployee && request.employee ? ` · ${request.employee.full_name} (${request.employee.employee_id})` : ""}</p></div>
      <StatusBadge status={REQUEST_STATUS_BADGE[request.status]} label={REQUEST_STATUS_LABEL[request.status]} />
    </div>
    <p className="whitespace-pre-line text-sm [overflow-wrap:anywhere]">{request.message}</p>
    {request.reply ? <div className="rounded-xl bg-muted/60 p-3 text-sm"><p className="text-xs font-semibold text-muted-foreground">Réponse RH{request.replied_at ? ` · ${formatDay(request.replied_at.slice(0, 10))}` : ""}</p>
      <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{request.reply}</p></div> : null}
    {renderActions?.(request)}
  </li>)}</ul>;
}
