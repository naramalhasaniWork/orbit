import { randomUUID } from "node:crypto";
import { z } from "zod";
import { consumeRateLimit, tooManyRequests } from "@/lib/auth/rate-limit";
import { writeAuditLog } from "@/lib/auth/audit";
import { appVersion } from "@/lib/app-version";
import { sanitizeClientContext } from "@/lib/bug-reports/context";
import { notifyNewBugReport } from "@/lib/bug-reports/notify";
import {
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_TYPES,
  isScreenshotType,
  sniffScreenshotType,
  type ScreenshotType,
} from "@/lib/bug-reports/screenshot";
import { getStorage } from "@/lib/storage";
import { apiSuccess } from "@/lib/utils/api";
import { createBugReport } from "@/server/data/bug-report-repo";
import { HttpError } from "@/server/http/errors";
import { route } from "@/server/http/route";

export const dynamic = "force-dynamic";

const RATE_LIMIT = { limit: 10, windowSec: 60 * 60 };
/** Screenshot plus a generous allowance for the message and context fields. */
const MAX_BODY_BYTES = SCREENSHOT_MAX_BYTES + 256 * 1024;

const Fields = z.object({
  message: z
    .string({ required_error: "Describe what went wrong" })
    .trim()
    .min(1, "Describe what went wrong")
    .max(5000, "Keep it under 5,000 characters"),
  context: z.string().max(64 * 1024).optional(),
});

function parseContext(raw: string | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function readScreenshot(value: FormDataEntryValue | null): Promise<{ bytes: Buffer; type: ScreenshotType } | null> {
  if (value === null || typeof value === "string" || value.size === 0) return null;
  if (value.size > SCREENSHOT_MAX_BYTES) {
    throw new HttpError(413, "SCREENSHOT_TOO_LARGE", "Screenshots can be up to 5 MB");
  }
  const bytes = Buffer.from(await value.arrayBuffer());
  const actual = sniffScreenshotType(bytes);
  // The declared type and the bytes must agree, so a renamed file cannot slip through.
  if (!actual || (value.type && (!isScreenshotType(value.type) || value.type !== actual))) {
    throw new HttpError(415, "SCREENSHOT_TYPE", "Screenshots must be PNG, JPEG or WebP");
  }
  return { bytes, type: actual };
}

// ============================================================
// POST /api/bug-reports — multipart: message, context (JSON), screenshot (optional)
// ============================================================

export const POST = route({}, async ({ req, auth, workspaceId, session, log }) => {
  const limited = await consumeRateLimit(`bug-report:${auth.userId}`, RATE_LIMIT.limit, RATE_LIMIT.windowSec);
  if (!limited.allowed) return tooManyRequests(limited, "You've sent a lot of reports. Try again in a bit.");

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    throw new HttpError(413, "SCREENSHOT_TOO_LARGE", "Screenshots can be up to 5 MB");
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "INVALID_BODY", "Send the report as multipart form data");
  }

  const fields = Fields.parse({
    message: form.get("message") ?? undefined,
    context: form.get("context") ?? undefined,
  });
  const screenshot = await readScreenshot(form.get("screenshot"));

  const id = randomUUID();
  const context = { ...sanitizeClientContext(parseContext(fields.context)), appVersion: appVersion() };
  let screenshotKey: string | null = null;
  if (screenshot) {
    screenshotKey = `bug-reports/${id}.${SCREENSHOT_TYPES[screenshot.type]}`;
    await getStorage().upload(screenshotKey, screenshot.bytes, screenshot.type);
  }

  await createBugReport({ id, workspaceId, userId: auth.userId, message: fields.message, context, screenshotKey });
  await writeAuditLog({
    workspaceId,
    userId: auth.userId,
    action: "bug_report.created",
    resourceType: "bug_report",
    resourceId: id,
    metadata: { path: context.path, screenshot: screenshotKey !== null },
  });

  notifyNewBugReport({
    id,
    message: fields.message,
    path: context.path,
    reporter: session.user.name ?? session.user.email ?? "A user",
  }).catch((err: unknown) => log.warn({ err }, "bug report email failed"));

  return apiSuccess({ id }, 201);
});
