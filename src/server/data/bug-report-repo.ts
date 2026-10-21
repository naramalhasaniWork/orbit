import type { BugReportContext } from "@/lib/bug-reports/context";
import { defaultDb, type Db } from "./db";

/**
 * Bug reports: written by any signed-in user, read and triaged by super admins across every
 * workspace (BugReport is a global model). The routes check who may call; this file does not.
 */

export type BugReportStatus = "open" | "resolved";
export type BugReportFilter = BugReportStatus | "all";

export interface BugReportRow {
  id: string;
  message: string;
  context: Partial<BugReportContext>;
  hasScreenshot: boolean;
  status: BugReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  reporter: { id: string; name: string | null; email: string; image: string | null };
  workspace: { id: string; name: string } | null;
}

const LIST_LIMIT = 200;

const select = {
  id: true,
  message: true,
  context: true,
  screenshotKey: true,
  status: true,
  createdAt: true,
  resolvedAt: true,
  resolvedBy: true,
  user: { select: { id: true, name: true, email: true, image: true } },
  workspace: { select: { id: true, name: true } },
} as const;

type Selected = {
  id: string;
  message: string;
  context: unknown;
  screenshotKey: string | null;
  status: BugReportStatus;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  user: BugReportRow["reporter"];
  workspace: BugReportRow["workspace"];
};

function toRow(r: Selected): BugReportRow {
  return {
    id: r.id,
    message: r.message,
    context: (r.context ?? {}) as Partial<BugReportContext>,
    hasScreenshot: r.screenshotKey !== null,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolvedBy: r.resolvedBy,
    reporter: r.user,
    workspace: r.workspace,
  };
}

export interface NewBugReport {
  id: string;
  workspaceId: string | null;
  userId: string;
  message: string;
  context: BugReportContext;
  screenshotKey: string | null;
}

export async function createBugReport(input: NewBugReport, db: Db = defaultDb): Promise<void> {
  await db.bugReport.create({
    data: { ...input, context: input.context as unknown as Record<string, string> },
  });
}

/** Newest first, capped: the list is a triage queue, not an archive browser. */
export async function listBugReports(filter: BugReportFilter, db: Db = defaultDb): Promise<BugReportRow[]> {
  const rows = await db.bugReport.findMany({
    where: filter === "all" ? {} : { status: filter },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select,
  });
  return rows.map(toRow);
}

export async function getBugReport(id: string, db: Db = defaultDb): Promise<BugReportRow | null> {
  const row = await db.bugReport.findUnique({ where: { id }, select });
  return row ? toRow(row) : null;
}

export async function getBugReportScreenshotKey(id: string, db: Db = defaultDb): Promise<string | null> {
  const row = await db.bugReport.findUnique({ where: { id }, select: { screenshotKey: true } });
  return row?.screenshotKey ?? null;
}

/** Resolve or reopen. Null when the report does not exist. */
export async function setBugReportStatus(
  id: string,
  status: BugReportStatus,
  actorId: string,
  db: Db = defaultDb
): Promise<BugReportRow | null> {
  const { count } = await db.bugReport.updateMany({
    where: { id },
    data:
      status === "resolved"
        ? { status, resolvedAt: new Date(), resolvedBy: actorId }
        : { status, resolvedAt: null, resolvedBy: null },
  });
  return count === 0 ? null : getBugReport(id, db);
}

export async function countOpenBugReports(db: Db = defaultDb): Promise<number> {
  return db.bugReport.count({ where: { status: "open" } });
}
