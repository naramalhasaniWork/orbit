import { NextResponse } from "next/server";
import { apiSuccess, apiError } from "@/lib/utils/api";
import { buildAuditCsvRow, CSV_HEADER } from "./csv-utils";
import type { WorkspaceScope } from "@/server/data/scope";
import { route } from "@/server/http/route";

// ============================================================
// GET /api/workspaces/[workspaceId]/audit-logs
// Supports JSON (default) and CSV (?format=csv) responses
// ============================================================

export const GET = route(
  { workspace: "param", permission: "audit.view" },
  async ({ req: request, workspaceId, db }) => {
    const url = request.nextUrl;
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)));
    const format = url.searchParams.get("format");
    const actionFilter = url.searchParams.get("action");
    const userId = url.searchParams.get("userId");
    const resourceType = url.searchParams.get("resourceType");
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const search = url.searchParams.get("search");

    const where = buildWhereClause(workspaceId, { actionFilter, userId, resourceType, from, to, search });

    if (format === "csv") {
      return streamCsvResponse(db, where);
    }

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ]);

    return apiSuccess({
      logs: logs.map(serializeLog),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
);

// ============================================================
// Helpers
// ============================================================

interface FilterParams {
  actionFilter: string | null;
  userId: string | null;
  resourceType: string | null;
  from: string | null;
  to: string | null;
  search: string | null;
}

interface AuditWhereClause {
  workspaceId: string;
  action?: { in: string[] };
  userId?: string;
  resourceType?: { in: string[] };
  createdAt?: { gte?: Date; lte?: Date };
  metadata?: { path: string[]; string_contains: string };
}

function buildWhereClause(workspaceId: string, filters: FilterParams): AuditWhereClause {
  const where: AuditWhereClause = { workspaceId };

  if (filters.actionFilter) {
    where.action = { in: filters.actionFilter.split(",").map((a) => a.trim()) };
  }

  if (filters.userId) {
    where.userId = filters.userId;
  }

  if (filters.resourceType) {
    where.resourceType = { in: filters.resourceType.split(",").map((r) => r.trim()) };
  }

  if (filters.from || filters.to) {
    where.createdAt = {};
    if (filters.from) where.createdAt.gte = new Date(filters.from);
    if (filters.to) {
      const toDate = new Date(filters.to);
      toDate.setHours(23, 59, 59, 999);
      where.createdAt.lte = toDate;
    }
  }

  if (filters.search) {
    where.metadata = { path: [], string_contains: filters.search };
  }

  return where;
}

interface AuditLogRecord {
  id: string;
  workspaceId: string;
  userId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: Date;
  user: { id: string; name: string | null; email: string } | null;
}

function serializeLog(log: AuditLogRecord) {
  return {
    id: log.id,
    userId: log.userId,
    userEmail: log.user?.email ?? null,
    userName: log.user?.name ?? null,
    action: log.action,
    resourceType: log.resourceType,
    resourceId: log.resourceId,
    metadata: log.metadata as Record<string, unknown>,
    ipAddress: log.ipAddress,
    createdAt: log.createdAt.toISOString(),
  };
}

async function streamCsvResponse(db: WorkspaceScope, where: AuditWhereClause): Promise<NextResponse> {
  const BATCH_SIZE = 500;
  let cursor: string | undefined;
  let isFirst = true;

  const stream = new ReadableStream({
    async pull(controller) {
      const logs = await db.auditLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (isFirst) {
        controller.enqueue(new TextEncoder().encode(CSV_HEADER + "\n"));
        isFirst = false;
      }

      for (const log of logs) {
        controller.enqueue(new TextEncoder().encode(buildAuditCsvRow(log) + "\n"));
      }

      if (logs.length < BATCH_SIZE) {
        controller.close();
        return;
      }

      cursor = logs[logs.length - 1]?.id;
    },
  });

  const timestamp = new Date().toISOString().split("T")[0];

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-logs-${timestamp}.csv"`,
    },
  });
}
