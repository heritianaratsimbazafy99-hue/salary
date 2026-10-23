import { timingSafeEqual } from "node:crypto";
import { processAgencyInvitationJobs } from "@/lib/employees/agency-invitations";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ data: await processAgencyInvitationJobs() }, { headers: { "cache-control": "private, no-store" } });
}
