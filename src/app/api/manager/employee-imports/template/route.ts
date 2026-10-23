import { NextResponse } from "next/server";
import { requireEmployeeImportActor } from "@/lib/employees/import-service";
import { buildEmployeeImportTemplate } from "@/lib/employees/import-parser";
import { employeeImportError } from "../response";
export async function GET() {
  try {
    await requireEmployeeImportActor();
    return new NextResponse(Buffer.from(buildEmployeeImportTemplate()), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": 'attachment; filename="modele-salaries.xlsx"', "cache-control": "private, no-store" } });
  } catch (error) { return employeeImportError(error); }
}
