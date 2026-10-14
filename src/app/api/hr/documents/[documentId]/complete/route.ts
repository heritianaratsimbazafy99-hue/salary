import { NextResponse } from "next/server";
import { completeDocumentUpload } from "@/lib/hr/documents";
import { hrNoStoreHeaders, hrRouteError } from "@/lib/hr/route-errors";

export const runtime = "nodejs";

/** Step 2 of an HR upload: verifies the stored bytes, then makes the document available. */
export async function POST(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  try {
    const { documentId } = await params;
    await completeDocumentUpload(documentId);
    return NextResponse.json({ data: { documentId } }, { headers: hrNoStoreHeaders });
  } catch (error) {
    return hrRouteError(error);
  }
}
