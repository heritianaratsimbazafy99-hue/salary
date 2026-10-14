import { NextResponse, type NextRequest } from "next/server";
import { getCurrentActor } from "@/lib/admin/auth";
import { FORBIDDEN_ERROR_MESSAGE } from "@/lib/admin/permissions";
import { recordAuditEvent } from "@/lib/audit/server";
import { apiError } from "@/lib/errors";
import { HR_REPORT_KINDS, buildReportCsv, type HrReportKind } from "@/lib/hr/reporting";
import { hrNoStoreHeaders, hrRouteError } from "@/lib/hr/route-errors";

export const runtime = "nodejs";
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const READERS: Record<HrReportKind, readonly string[]> = {
  workforce: ["hr_central", "super_admin", "team_manager", "client_viewer"],
  replacements: ["hr_central", "super_admin", "team_manager", "client_viewer"],
  leaves: ["hr_central", "super_admin"],
};

function currentMonth() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

/** CSV export filtered by the caller's role and scope (the database applies both). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  try {
    const { kind } = await params;
    const reportKind = HR_REPORT_KINDS.find((candidate) => candidate === kind);
    if (!reportKind) return NextResponse.json(apiError("NOT_FOUND", "Rapport inconnu."), { status: 404, headers: hrNoStoreHeaders });
    const actor = await getCurrentActor();
    if (!READERS[reportKind].includes(actor.role)) throw new Error(FORBIDDEN_ERROR_MESSAGE);
    const search = request.nextUrl.searchParams;
    const defaults = currentMonth();
    const from = DAY.test(search.get("from") ?? "") ? search.get("from")! : defaults.from;
    const to = DAY.test(search.get("to") ?? "") ? search.get("to")! : defaults.to;
    if (to < from) return NextResponse.json(apiError("VALIDATION_ERROR", "La fin doit suivre le début."), { status: 422, headers: hrNoStoreHeaders });
    const agencyId = search.get("agencyId") ?? undefined;
    const { csv, rows } = await buildReportCsv(reportKind, { agencyId, from, to });
    await recordAuditEvent({ action: "hr_report.exported", resourceType: "hr_report", actorProfileId: actor.id, actorRole: actor.role,
      metadata: { kind: reportKind, from, to, rows, agency_filter: Boolean(agencyId) } });
    return new NextResponse(`﻿${csv}`, {
      headers: {
        ...hrNoStoreHeaders,
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="rh-${reportKind}-${from}-${to}.csv"`,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return hrRouteError(error);
  }
}
