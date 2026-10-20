import { prisma } from "@/lib/db";
import { sendEmail, type SendEmailResult } from "./send";

interface InviteEmailInput {
  to: string;
  workspaceName: string;
  inviterName: string | null;
  role: string;
  acceptUrl: string;
  expiresAt: Date;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildInviteEmail(input: InviteEmailInput) {
  const inviter = input.inviterName?.trim() || "A teammate";
  const expires = input.expiresAt.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const subject = `${inviter} invited you to ${input.workspaceName} on Orbit`;

  const text = [
    `${inviter} invited you to join ${input.workspaceName} on Orbit as ${input.role}.`,
    "",
    `Accept the invitation: ${input.acceptUrl}`,
    "",
    `This invitation is for ${input.to} and expires on ${expires}.`,
    "If you weren't expecting it, you can ignore this email.",
  ].join("\n");

  const name = escapeHtml(input.workspaceName);
  const url = escapeHtml(input.acceptUrl);
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:8px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 16px;font-size:20px;">Join ${name} on Orbit</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.5;">
          ${escapeHtml(inviter)} invited you to join <strong>${name}</strong> as ${escapeHtml(input.role)}.
        </p>
        <p style="margin:0 0 24px;">
          <a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-size:15px;">Accept invitation</a>
        </p>
        <p style="margin:0 0 8px;font-size:13px;color:#52525b;">Or paste this link into your browser:<br><a href="${url}" style="color:#52525b;word-break:break-all;">${url}</a></p>
        <p style="margin:16px 0 0;font-size:13px;color:#52525b;">This invitation is for ${escapeHtml(input.to)} and expires on ${expires}. If you weren't expecting it, you can ignore this email.</p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

export function inviteAcceptUrl(token: string): string {
  const base = (process.env.NEXTAUTH_URL ?? "").replace(/\/$/, "");
  return `${base}/invite/${token}`;
}

export async function sendInviteEmail(input: InviteEmailInput): Promise<SendEmailResult> {
  return sendEmail({ to: input.to, ...buildInviteEmail(input) });
}

/** Look up the workspace name and email the invitation. Never throws. */
export async function deliverInviteEmail(
  workspaceId: string,
  invitation: { email: string; role: string; token: string; expiresAt: Date },
  inviterName: string | null
): Promise<SendEmailResult> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true },
  });
  if (!workspace) return { sent: false, reason: "workspace_not_found" };

  return sendInviteEmail({
    to: invitation.email,
    workspaceName: workspace.name,
    inviterName,
    role: invitation.role,
    acceptUrl: inviteAcceptUrl(invitation.token),
    expiresAt: invitation.expiresAt,
  });
}
