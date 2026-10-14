import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/errors";
import { runContractAlerts, runMonthlyReports } from "@/lib/hr/notifications";

export const runtime = "nodejs";
export const maxDuration = 60;
const NO_STORE = { "cache-control": "private, no-store" };

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 32) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Scheduled by Vercel Cron (vercel.json). Requires CRON_SECRET (≥ 32 characters)
 * in the project environment; without it the route refuses every call.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json(apiError("UNAUTHORIZED", "Accès refusé."), { status: 401, headers: NO_STORE });
  const task = request.nextUrl.searchParams.get("task");
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (task === "alerts") return NextResponse.json({ data: { task, today, ...(await runContractAlerts(today)) } }, { headers: NO_STORE });
    if (task === "monthly") return NextResponse.json({ data: { task, today, ...(await runMonthlyReports(today)) } }, { headers: NO_STORE });
    return NextResponse.json(apiError("VALIDATION_ERROR", "Tâche inconnue."), { status: 422, headers: NO_STORE });
  } catch {
    return NextResponse.json(apiError("INTERNAL_ERROR", "Tâche interrompue."), { status: 500, headers: NO_STORE });
  }
}
