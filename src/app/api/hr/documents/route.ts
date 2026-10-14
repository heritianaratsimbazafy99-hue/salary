import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/errors";
import { beginDocumentUpload } from "@/lib/hr/documents";
import { hrNoStoreHeaders, hrRouteError } from "@/lib/hr/route-errors";

export const runtime = "nodejs";
const MAX_JSON_BYTES = 8 * 1024;

/** Step 1 of an HR upload: metadata only. The file itself goes straight to private storage. */
export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !Number.isFinite(length) || length > MAX_JSON_BYTES) {
    return NextResponse.json(apiError("VALIDATION_ERROR", "Requête invalide."), { status: 422, headers: hrNoStoreHeaders });
  }
  try {
    const text = await request.text();
    if (text.length > MAX_JSON_BYTES) return NextResponse.json(apiError("VALIDATION_ERROR", "Requête invalide."), { status: 422, headers: hrNoStoreHeaders });
    let body: unknown;
    try { body = JSON.parse(text); } catch { return NextResponse.json(apiError("VALIDATION_ERROR", "Requête invalide."), { status: 422, headers: hrNoStoreHeaders }); }
    const upload = await beginDocumentUpload(body);
    return NextResponse.json({ data: upload }, { status: 201, headers: hrNoStoreHeaders });
  } catch (error) {
    return hrRouteError(error);
  }
}
