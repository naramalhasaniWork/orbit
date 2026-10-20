import { describe, it, expect } from "vitest";
import { isAllowedWebhookUrl } from "@/lib/integrations/webhook-url";

describe("isAllowedWebhookUrl", () => {
  it("accepts public https URLs", () => {
    expect(isAllowedWebhookUrl("https://example.com/hooks/orbit")).toBe(true);
  });

  it.each([
    "http://example.com/hook",
    "https://localhost/hook",
    "https://127.0.0.1/hook",
    "https://10.0.0.5/hook",
    "https://192.168.1.10/hook",
    "https://172.16.0.1/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
    "https://db.internal/hook",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isAllowedWebhookUrl(url)).toBe(false);
  });
});
