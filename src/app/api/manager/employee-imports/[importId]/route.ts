import { NextResponse } from "next/server";
import { z } from "zod";
import { commitEmployeeImport, getEmployeeImport, reviewEmployeeImport } from "@/lib/employees/import-service";
import { EmployeeImportReviewSchema } from "@/lib/employees/import-schema";
import { employeeImportError, hasEmployeeImportOrigin, readEmployeeImportBody } from "../response";
export async function GET(_request: Request, context: { params: Promise<{ importId: string }> }) {
  try {
    const { importId } = await context.params;
    if (!z.uuid().safeParse(importId).success) return NextResponse.json({ error: "Import introuvable." }, { status: 404 });
    const report = await getEmployeeImport(importId);
    return NextResponse.json(report ?? { error: "Import introuvable ou expiré." }, { status: report ? 200 : 404, headers: { "cache-control": "private, no-store" } });
  } catch (error) { return employeeImportError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ importId: string }> }) {
  try {
    if (!hasEmployeeImportOrigin(request)) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
    const { importId } = await context.params;
    if (!z.uuid().safeParse(importId).success) return NextResponse.json({ error: "Import introuvable." }, { status: 404 });
    if (Number(request.headers.get("content-length"))>32768) return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 });
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(await readEmployeeImportBody(request, 32768))); } catch { return NextResponse.json({ error: "Sélection invalide." }, { status: 422 }); }
    const input = z.discriminatedUnion("intent", [EmployeeImportReviewSchema.extend({ intent: z.literal("review") }), z.object({ intent: z.literal("commit"), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict()]).safeParse(body);
    if (!input.success) return NextResponse.json({ error: "Sélection invalide." }, { status: 422 });
    if (input.data.intent === "review") await reviewEmployeeImport(importId, input.data.fingerprint, input.data.excluded);
    else await commitEmployeeImport(importId, input.data.fingerprint);
    return NextResponse.json({ ok: true });
  } catch (error) { return employeeImportError(error); }
}
