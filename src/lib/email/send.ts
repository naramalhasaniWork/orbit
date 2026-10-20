export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendEmailResult = { sent: true; id?: string } | { sent: false; reason: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Send a transactional email through Resend's REST API. Returns {sent:false}
 * instead of throwing when no provider is configured or delivery fails, so
 * callers can always fall back to another channel (e.g. a copyable link).
 */
export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return { sent: false, reason: "not_configured" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      console.warn(`[email] Resend rejected message (${response.status})`);
      return { sent: false, reason: `provider_error_${response.status}` };
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { sent: true, id: body?.id };
  } catch (error) {
    console.warn("[email] Send failed:", error instanceof Error ? error.message : error);
    return { sent: false, reason: "network_error" };
  }
}
