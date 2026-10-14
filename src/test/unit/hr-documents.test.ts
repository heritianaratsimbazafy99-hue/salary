import { beforeEach, describe, expect, it, vi } from "vitest";

import { detectDocumentMime } from "../../lib/hr/file-signature";

const supabaseMocks = vi.hoisted(() => ({ createAdminClient: vi.fn(), createServerClient: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("../../lib/supabase/admin", () => ({ createAdminClient: supabaseMocks.createAdminClient }));
vi.mock("../../lib/supabase/server", () => ({ createClient: supabaseMocks.createServerClient }));

const EMPLOYEE = "00000000-0000-4000-8000-0000000000c1";
const DOCUMENT = "00000000-0000-4000-8000-0000000000f1";
const PDF = new TextEncoder().encode("%PDF-1.7\n%test");
const valid = { employeeId: EMPLOYEE, category: "CONTRACT", title: "Contrat", documentDate: "2026-01-05", period: null, mimeType: "application/pdf", sizeBytes: PDF.byteLength };

function serverClient(role: string, documentRow: unknown = null) {
  return {
    auth: { getClaims: vi.fn(async () => ({ data: { claims: { sub: "00000000-0000-0000-0000-000000000001" } }, error: null })) },
    from: vi.fn((table: string) => table === "profiles"
      ? { select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "00000000-0000-0000-0000-000000000101", role }, error: null })) })) })) }
      : { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: documentRow, error: null })) })) })) }),
  };
}

function adminClient(options: { stored?: Uint8Array; completeError?: { code: string; message: string } | null } = {}) {
  const bucket = {
    createSignedUploadUrl: vi.fn(async () => ({ data: { token: "upload-token" }, error: null })),
    download: vi.fn(async () => ({ data: new Blob([new Uint8Array(options.stored ?? PDF)]), error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "http://storage.test/signed" }, error: null })),
  };
  const rpc = vi.fn(async (name: string) => {
    if (name === "hr_begin_document_upload") return { data: [{ document_id: DOCUMENT, storage_path: `a/${EMPLOYEE}/${DOCUMENT}` }], error: null };
    if (name === "hr_complete_document_upload") return { data: null, error: options.completeError ?? null };
    if (name === "hr_reject_document_upload") return { data: `a/${EMPLOYEE}/${DOCUMENT}`, error: null };
    return { data: null, error: null };
  });
  return {
    bucket, rpc,
    storage: { from: vi.fn(() => bucket) },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({ data: { id: DOCUMENT, status: "PENDING", mime_type: "application/pdf", size_bytes: PDF.byteLength, storage_path: `a/${EMPLOYEE}/${DOCUMENT}` }, error: null })),
      single: vi.fn(async () => ({ data: { storage_path: `a/${EMPLOYEE}/${DOCUMENT}` }, error: null })),
    })) })) })),
  };
}

describe("document signature", () => {
  it("detects PDF, PNG and JPEG from bytes and rejects anything else", () => {
    expect(detectDocumentMime(PDF)).toBe("application/pdf");
    expect(detectDocumentMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("image/png");
    expect(detectDocumentMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectDocumentMime(new TextEncoder().encode("<html>%PDF-"))).toBeNull();
    expect(detectDocumentMime(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
    expect(detectDocumentMime(new Uint8Array())).toBeNull();
  });
});

describe("HR private documents", () => {
  beforeEach(() => {
    vi.resetModules();
    supabaseMocks.createAdminClient.mockReset();
    supabaseMocks.createServerClient.mockReset();
  });

  it.each(["team_manager", "client_viewer", "agency_manager", "employee"])("refuses an upload by %s before any service-role call", async (role) => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient(role));
    const { beginDocumentUpload } = await import("../../lib/hr/documents");
    await expect(beginDocumentUpload(valid)).rejects.toThrow("Action non autorisee.");
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("validates size, type and the historical payslip period before registering", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("hr_central"));
    const { beginDocumentUpload } = await import("../../lib/hr/documents");
    await expect(beginDocumentUpload({ ...valid, sizeBytes: 10 * 1024 * 1024 + 1 })).rejects.toMatchObject({ status: 422 });
    await expect(beginDocumentUpload({ ...valid, mimeType: "image/gif" })).rejects.toMatchObject({ status: 422 });
    await expect(beginDocumentUpload({ ...valid, category: "HISTORICAL_PAYSLIP" })).rejects.toThrow(/période est obligatoire/);
    await expect(beginDocumentUpload({ ...valid, period: "2026-01" })).rejects.toThrow(/période est obligatoire/);
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("registers a pending document and signs a single upload for its derived path", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("hr_central"));
    const admin = adminClient();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { beginDocumentUpload } = await import("../../lib/hr/documents");
    await expect(beginDocumentUpload({ ...valid, category: "HISTORICAL_PAYSLIP", period: "2025-06" })).resolves.toEqual({ documentId: DOCUMENT, path: `a/${EMPLOYEE}/${DOCUMENT}`, token: "upload-token" });
    expect(admin.rpc).toHaveBeenCalledWith("hr_begin_document_upload", expect.objectContaining({ p_period: "2025-06", p_mime_type: "application/pdf" }));
    expect(admin.bucket.createSignedUploadUrl).toHaveBeenCalledWith(`a/${EMPLOYEE}/${DOCUMENT}`);
  });

  it("publishes only after checking the stored bytes", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("super_admin"));
    const admin = adminClient();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { completeDocumentUpload } = await import("../../lib/hr/documents");
    await completeDocumentUpload(DOCUMENT);
    expect(admin.rpc).toHaveBeenCalledWith("hr_complete_document_upload", expect.objectContaining({ p_verified_mime: "application/pdf", p_verified_size: PDF.byteLength }));
    expect(admin.bucket.remove).not.toHaveBeenCalled();
  });

  it("rejects and deletes a stored file whose bytes do not match the declaration", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("hr_central"));
    const html = new TextEncoder().encode("<html>not a pdf</html>");
    const admin = adminClient({ stored: html, completeError: { code: "22023", message: "invalid_file" } });
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { completeDocumentUpload } = await import("../../lib/hr/documents");
    await expect(completeDocumentUpload(DOCUMENT)).rejects.toMatchObject({ status: 422 });
    expect(admin.rpc).toHaveBeenCalledWith("hr_complete_document_upload", expect.objectContaining({ p_verified_mime: null }));
    expect(admin.rpc).toHaveBeenCalledWith("hr_reject_document_upload", expect.anything());
    expect(admin.bucket.remove).toHaveBeenCalledWith([`a/${EMPLOYEE}/${DOCUMENT}`]);
  });

  it("returns the same not-found answer for unknown, pending or other people's documents", async () => {
    for (const row of [null, { id: DOCUMENT, title: "Contrat", mime_type: "application/pdf", status: "PENDING" }]) {
      supabaseMocks.createServerClient.mockResolvedValue(serverClient("employee", row));
      const { getDocumentDownloadUrl } = await import("../../lib/hr/documents");
      await expect(getDocumentDownloadUrl(DOCUMENT)).resolves.toBeNull();
    }
    expect(supabaseMocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("signs a 60-second download with a sanitized filename once RLS shows the document", async () => {
    supabaseMocks.createServerClient.mockResolvedValue(serverClient("employee", { id: DOCUMENT, title: "Contrat été / 2026", mime_type: "application/pdf", status: "AVAILABLE" }));
    const admin = adminClient();
    supabaseMocks.createAdminClient.mockReturnValue(admin);
    const { getDocumentDownloadUrl } = await import("../../lib/hr/documents");
    await expect(getDocumentDownloadUrl(DOCUMENT)).resolves.toBe("http://storage.test/signed");
    expect(admin.bucket.createSignedUrl).toHaveBeenCalledWith(`a/${EMPLOYEE}/${DOCUMENT}`, 60, { download: "Contrat-ete-2026.pdf" });
  });
});
