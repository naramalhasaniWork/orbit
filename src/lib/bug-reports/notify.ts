import { sendEmail } from "@/lib/email/send";
import { escapeHtml } from "@/lib/setup/github-app";

interface NewReportNotice {
  id: string;
  message: string;
  path: string;
  reporter: string;
}

function superAdminEmails(): string[] {
  return (process.env.SUPER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Email each SUPER_ADMIN_EMAILS address about a new report. Best effort: no provider, no
 * recipients or a failed send all end quietly, and the caller never waits on it.
 */
export async function notifyNewBugReport(report: NewReportNotice): Promise<void> {
  const recipients = superAdminEmails();
  if (recipients.length === 0) return;

  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, "") ?? "";
  const link = `${base}/admin/reports?report=${report.id}`;
  const firstLine = report.message.split("\n")[0].slice(0, 80);
  const subject = `Bug report: ${firstLine}`;
  const text = `${report.reporter} reported a bug on ${report.path}\n\n${report.message}\n\n${link}`;
  const html =
    `<p>${escapeHtml(report.reporter)} reported a bug on <code>${escapeHtml(report.path)}</code></p>` +
    `<pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(report.message)}</pre>` +
    `<p><a href="${escapeHtml(link)}">Open in admin</a></p>`;

  await Promise.allSettled(recipients.map((to) => sendEmail({ to, subject, html, text })));
}
