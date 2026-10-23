import { afterEach, describe, expect, it, vi } from "vitest";
import { employeeImportError, hasEmployeeImportOrigin, readEmployeeImportBody } from "@/app/api/manager/employee-imports/response";
import { EmployeeImportInputError } from "@/lib/employees/import-schema";
describe("employee import request limits and safe errors", () => {
  it("bounds a chunked body even without content-length", async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(3)); controller.enqueue(new Uint8Array(3)); controller.close(); } });
    const request = new Request("http://localhost/import", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    await expect(readEmployeeImportBody(request,5)).rejects.toThrow("limite autorisée");
  });
  it("returns complete data within the bound", async () => {
    const request = new Request("http://localhost/import", { method: "POST", body: "abc" });
    expect(new TextDecoder().decode(await readEmployeeImportBody(request,3))).toBe("abc");
  });
  it("shows French workbook corrections but hides infrastructure details", async () => {
    const invalid = employeeImportError(new EmployeeImportInputError("Matricule texte obligatoire."));
    expect(invalid.status).toBe(422); expect((await invalid.json()).error).toBe("Matricule texte obligatoire.");
    const failure = employeeImportError(new Error("internal connection credentials"));
    expect(failure.status).toBe(500); expect(JSON.stringify(await failure.json())).not.toContain("credentials");
    expect(employeeImportError({ code: "PT409" }).status).toBe(409);
  });
});

describe("employee import canonical origin", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("accepts the configured browser origin when Next uses an internal request host", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55421");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3000");
    expect(hasEmployeeImportOrigin(new Request("http://localhost:3000/api/manager/employee-imports", { headers: { origin: "http://127.0.0.1:3000" } }))).toBe(true);
    for (const origin of ["http://localhost:3000", "https://evil.example", "http://127.0.0.1:3001", "null", "http://127.0.0.1:3000.evil.example", "http://127.0.0.1:3000/path"]) {
      expect(hasEmployeeImportOrigin(new Request("http://localhost:3000/api/manager/employee-imports", { headers: { origin } }))).toBe(false);
    }
    expect(hasEmployeeImportOrigin(new Request("http://localhost:3000/api/manager/employee-imports"))).toBe(false);
  });
});
