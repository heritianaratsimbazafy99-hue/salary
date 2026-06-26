const BLOCKED_METADATA_KEYS = new Set([
  "token",
  "accessToken",
  "refreshToken",
  "grossAmount",
  "netAmount",
  "deductionsTotal",
  "snapshotData",
  "rawExcel",
]);

export function sanitizeAuditMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(metadata).filter(([key]) => !BLOCKED_METADATA_KEYS.has(key)));
}
