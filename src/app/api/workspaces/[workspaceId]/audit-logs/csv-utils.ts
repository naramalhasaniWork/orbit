/**
 * CSV formatting utilities for audit log export.
 */

export const CSV_HEADER =
  "timestamp,user_email,action,resource_type,resource_id,ip_address,details";

interface CsvLogRecord {
  createdAt: Date;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  user: { email: string; name: string | null } | null;
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildAuditCsvRow(log: CsvLogRecord): string {
  const metadataStr = log.metadata
    ? JSON.stringify(log.metadata)
    : "";

  return [
    log.createdAt.toISOString(),
    escapeCsvField(log.user?.email ?? "system"),
    escapeCsvField(log.action),
    escapeCsvField(log.resourceType ?? ""),
    escapeCsvField(log.resourceId ?? ""),
    escapeCsvField(log.ipAddress ?? ""),
    escapeCsvField(metadataStr),
  ].join(",");
}
