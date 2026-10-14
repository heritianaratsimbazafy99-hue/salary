import { NextResponse } from "next/server";
import { apiError } from "@/lib/errors";
import { getDocumentDownloadUrl } from "@/lib/hr/documents";
import { hrNoStoreHeaders, hrRouteError } from "@/lib/hr/route-errors";

export const runtime = "nodejs";

/** Private download: authorization through the caller's session, then a 60-second signed URL. */
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    const url = await getDocumentDownloadUrl(documentId);
    // Unknown, pending and other people's documents share the same response.
    if (!url) return NextResponse.json(apiError("NOT_FOUND", "Document introuvable."), { status: 404, headers: hrNoStoreHeaders });
    return NextResponse.redirect(url, { status: 303, headers: { ...hrNoStoreHeaders, "referrer-policy": "no-referrer" } });
  } catch (error) {
    return hrRouteError(error);
  }
}
