import "server-only";
import { z } from "zod";
import { getCurrentActor, requireCanManageHrReferential } from "../admin/auth";
import { FORBIDDEN_ERROR_MESSAGE } from "../admin/permissions";
import { createAdminClient } from "../supabase/admin";
import { createClient } from "../supabase/server";
import { hrRpcErrorMessage } from "./errors";
import { HR_DOCUMENT_MAX_BYTES, HR_DOCUMENT_MIME_TYPES, detectDocumentMime } from "./file-signature";

export const HR_DOCUMENT_BUCKET = "hr-documents";
const SIGNED_DOWNLOAD_SECONDS = 60;

export const HR_DOCUMENT_CATEGORIES = ["CONTRACT", "ADMINISTRATIVE", "HISTORICAL_PAYSLIP"] as const;
export type HrDocumentCategory = (typeof HR_DOCUMENT_CATEGORIES)[number];
export type HrDocumentStatus = "PENDING" | "AVAILABLE" | "REJECTED" | "WITHDRAWN";
/** Metadata only: the storage path is never selected for a browser-facing read. */
export type HrDocument = {
  id: string; employee_id: string; category: HrDocumentCategory; title: string; document_date: string; period: string | null;
  mime_type: string; size_bytes: number; status: HrDocumentStatus; created_at: string; available_at: string | null; withdrawn_at: string | null;
};
export type PublishedPayslip = { id: string; period_start: string; period_end: string; published_at: string; version_number: number | null };

const DOCUMENT_COLUMNS = "id,employee_id,category,title,document_date,period,mime_type,size_bytes,status,created_at,available_at,withdrawn_at";
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const BeginInput = z.object({
  employeeId: uuid,
  category: z.enum(HR_DOCUMENT_CATEGORIES),
  title: z.string().trim().min(1).max(200),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.union([z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), z.literal(""), z.null()]).transform((value) => value || null),
  mimeType: z.enum(HR_DOCUMENT_MIME_TYPES),
  sizeBytes: z.number().int().min(1).max(HR_DOCUMENT_MAX_BYTES),
}).refine((input) => (input.category === "HISTORICAL_PAYSLIP") === !!input.period, "La période est obligatoire pour un bulletin historique, et seulement pour lui.");

export class HrDocumentError extends Error {
  constructor(message: string, readonly status: 400 | 404 | 409 | 422 | 500) { super(message); }
}

export async function listEmployeeDocumentsForHr(employeeId: string): Promise<{ documents: HrDocument[]; payslips: PublishedPayslip[] }> {
  await requireCanManageHrReferential();
  if (!uuid.safeParse(employeeId).success) return { documents: [], payslips: [] };
  const client = await createClient();
  const [documents, payslips] = await Promise.all([
    client.from("employee_documents").select(DOCUMENT_COLUMNS).eq("employee_id", employeeId).neq("status", "PENDING").order("document_date", { ascending: false }),
    client.from("payslips").select("id,period_start,period_end,published_at,current_version:payslip_versions!payslips_current_version_fk(version_number)")
      .eq("employee_id", employeeId).not("current_version_id", "is", null).order("period_start", { ascending: false }),
  ]);
  if (documents.error || payslips.error) throw new Error("Impossible de charger les documents.");
  return {
    documents: (documents.data ?? []) as HrDocument[],
    payslips: (payslips.data ?? []).map((row) => {
      const version = (Array.isArray(row.current_version) ? row.current_version[0] : row.current_version) as { version_number?: number } | null;
      return { id: row.id, period_start: row.period_start, period_end: row.period_end, published_at: row.published_at, version_number: version?.version_number ?? null };
    }),
  };
}

/** The signed-in employee's available documents; RLS returns nothing for anyone else. */
export async function listOwnDocuments(): Promise<HrDocument[]> {
  const actor = await getCurrentActor();
  if (actor.role !== "employee") throw new Error(FORBIDDEN_ERROR_MESSAGE);
  const client = await createClient();
  const { data, error } = await client.from("employee_documents").select(DOCUMENT_COLUMNS).eq("status", "AVAILABLE").order("document_date", { ascending: false });
  if (error) throw new Error("Impossible de charger vos documents.");
  return (data ?? []) as HrDocument[];
}

/** Step 1 (HR): registers a pending document and returns a single-use signed upload. */
export async function beginDocumentUpload(input: unknown): Promise<{ documentId: string; path: string; token: string }> {
  const parsed = BeginInput.safeParse(input);
  if (!parsed.success) throw new HrDocumentError(parsed.error.issues[0]?.message.startsWith("La période") ? parsed.error.issues[0].message : "Champs invalides.", 422);
  const actor = await requireCanManageHrReferential();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("hr_begin_document_upload", {
    p_actor_id: actor.id, p_employee_id: parsed.data.employeeId, p_category: parsed.data.category, p_title: parsed.data.title,
    p_document_date: parsed.data.documentDate, p_period: parsed.data.period, p_mime_type: parsed.data.mimeType, p_size_bytes: parsed.data.sizeBytes,
  });
  const row = Array.isArray(data) ? (data[0] as { document_id?: string; storage_path?: string } | undefined) : undefined;
  if (error || !row?.document_id || !row.storage_path) {
    throw new HrDocumentError(error ? hrRpcErrorMessage(error, "Impossible de préparer le dépôt.") : "Impossible de préparer le dépôt.", error?.code === "P0002" ? 404 : 422);
  }
  const signed = await admin.storage.from(HR_DOCUMENT_BUCKET).createSignedUploadUrl(row.storage_path);
  if (signed.error || !signed.data?.token) {
    await admin.rpc("hr_reject_document_upload", { p_actor_id: actor.id, p_document_id: row.document_id });
    throw new HrDocumentError("Impossible de préparer le dépôt.", 500);
  }
  return { documentId: row.document_id, path: row.storage_path, token: signed.data.token };
}

/**
 * Step 2 (HR): reads the stored bytes, checks size and binary signature against
 * the declaration, then publishes the document. A mismatch deletes the object.
 */
export async function completeDocumentUpload(documentId: string): Promise<void> {
  if (!uuid.safeParse(documentId).success) throw new HrDocumentError("Document introuvable.", 404);
  const actor = await requireCanManageHrReferential();
  const admin = createAdminClient();
  const { data: document, error } = await admin.from("employee_documents").select("id,status,mime_type,size_bytes,storage_path").eq("id", documentId).maybeSingle();
  if (error) throw new HrDocumentError("Impossible de vérifier le document.", 500);
  if (!document) throw new HrDocumentError("Document introuvable.", 404);
  if (document.status !== "PENDING") throw new HrDocumentError("Ce dépôt a déjà été traité.", 409);
  const downloaded = await admin.storage.from(HR_DOCUMENT_BUCKET).download(document.storage_path);
  if (downloaded.error || !downloaded.data) throw new HrDocumentError("Le fichier n’a pas été reçu. Recommencez le dépôt.", 409);
  const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
  const detected = detectDocumentMime(bytes);
  const { error: completeError } = await admin.rpc("hr_complete_document_upload", {
    p_actor_id: actor.id, p_document_id: documentId, p_verified_mime: detected, p_verified_size: bytes.byteLength,
  });
  if (!completeError) return;
  if (completeError.code === "22023") {
    const { data: path } = await admin.rpc("hr_reject_document_upload", { p_actor_id: actor.id, p_document_id: documentId });
    if (typeof path === "string") await admin.storage.from(HR_DOCUMENT_BUCKET).remove([path]);
    throw new HrDocumentError("Fichier refusé : son contenu n’est pas un PDF, PNG ou JPEG conforme à la déclaration.", 422);
  }
  throw new HrDocumentError(hrRpcErrorMessage(completeError, "Impossible de publier le document."), completeError.code === "PT409" ? 409 : 500);
}

export async function withdrawDocument(input: { documentId: string; reason: string }): Promise<void> {
  const parsed = z.object({ documentId: uuid, reason: z.string().trim().min(3).max(500) }).safeParse(input);
  if (!parsed.success) throw new Error("Indiquez le motif du retrait (3 caractères minimum).");
  const actor = await requireCanManageHrReferential();
  const { error } = await createAdminClient().rpc("hr_withdraw_document", { p_actor_id: actor.id, p_document_id: parsed.data.documentId, p_reason: parsed.data.reason });
  if (error) throw new Error(hrRpcErrorMessage(error, "Impossible de retirer le document."));
}

/**
 * Authorizes through the caller's own session (RLS: HR, or the employee owner of
 * an available document), then returns a 60-second signed URL. Unknown, pending
 * and other people's documents are indistinguishable (null).
 */
export async function getDocumentDownloadUrl(documentId: string): Promise<string | null> {
  await getCurrentActor();
  if (!uuid.safeParse(documentId).success) return null;
  const client = await createClient();
  const { data: visible, error } = await client.from("employee_documents").select("id,title,mime_type,status").eq("id", documentId).maybeSingle();
  if (error) throw new Error("Impossible de vérifier le document.");
  if (!visible || (visible.status !== "AVAILABLE" && visible.status !== "WITHDRAWN")) return null;
  const admin = createAdminClient();
  const { data: stored } = await admin.from("employee_documents").select("storage_path").eq("id", documentId).single();
  if (!stored?.storage_path) return null;
  const extension = visible.mime_type === "application/pdf" ? "pdf" : visible.mime_type === "image/png" ? "png" : "jpg";
  const filename = `${visible.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "document"}.${extension}`;
  const signed = await admin.storage.from(HR_DOCUMENT_BUCKET).createSignedUrl(stored.storage_path, SIGNED_DOWNLOAD_SECONDS, { download: filename });
  if (signed.error || !signed.data?.signedUrl) throw new Error("Impossible de préparer le téléchargement.");
  return signed.data.signedUrl;
}
