import { NextResponse } from "next/server";
import { EMPLOYEE_IMPORT_MAX_BYTES } from "@/lib/employees/import-schema";
import { previewEmployeeImport, requireEmployeeImportActor } from "@/lib/employees/import-service";
import { employeeImportError, hasEmployeeImportOrigin, readEmployeeImportBody } from "./response";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    await requireEmployeeImportActor();
    if (!hasEmployeeImportOrigin(request)) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
    if (Number(request.headers.get("content-length")) > EMPLOYEE_IMPORT_MAX_BYTES + 65536) return NextResponse.json({ error: "Le fichier dépasse 4 Mo." }, { status: 413 });
    const bytes = await readEmployeeImportBody(request, EMPLOYEE_IMPORT_MAX_BYTES + 65536);
    const data = await new Response(Buffer.from(bytes), { headers: request.headers }).formData(); const file = data.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choisissez un fichier XLSX." }, { status: 422 });
    return NextResponse.json({ id: await previewEmployeeImport(file) });
  } catch (error) { return employeeImportError(error); }
}
