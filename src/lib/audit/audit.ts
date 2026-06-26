const ALLOWED_METADATA_KEYS = new Set([
  "rowCount",
  "filename",
  "resourceId",
  "status",
  "importId",
  "agencyId",
  "periodStart",
  "periodEnd",
]);

export function sanitizeAuditMetadata(metadata: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key]) => ALLOWED_METADATA_KEYS.has(key))
      .map(([key, value]) => [key, sanitizeAuditValue(value)]),
  );
}

function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeAuditValue);
  }

  if (value !== null && typeof value === "object") {
    return sanitizeAuditMetadata(value as Record<string, unknown>);
  }

  return value;
}
