import { describe, it, expect } from "vitest";
import {
  buildManifest,
  credentialVariables,
  defaultAppName,
  escapeHtml,
  githubAppSettings,
} from "@/lib/setup/github-app";

describe("githubAppSettings", () => {
  it("derives every URL from the base URL", () => {
    expect(githubAppSettings("https://orbit.example.com/")).toMatchObject({
      baseUrl: "https://orbit.example.com",
      callbackUrl: "https://orbit.example.com/api/auth/callback/github",
      setupUrl: "https://orbit.example.com/api/github/installations/callback",
      webhookUrl: "https://orbit.example.com/api/webhooks/github",
    });
  });
});

describe("buildManifest", () => {
  const manifest = buildManifest("https://orbit.example.com");

  it("pre-fills URLs, OAuth-on-install and the required permissions", () => {
    expect(manifest.callback_urls).toEqual(["https://orbit.example.com/api/auth/callback/github"]);
    expect(manifest.setup_url).toBe("https://orbit.example.com/api/github/installations/callback");
    expect(manifest.hook_attributes.url).toBe("https://orbit.example.com/api/webhooks/github");
    expect(manifest.request_oauth_on_install).toBe(true);
    expect(manifest.default_permissions).toEqual({
      contents: "read",
      pull_requests: "write",
      checks: "write",
      metadata: "read",
      members: "read",
    });
  });

  it("keeps the app name within GitHub's 34 characters", () => {
    expect(defaultAppName("https://a-very-long-hostname-that-goes-on-and-on-forever.example.com").length).toBeLessThanOrEqual(34);
  });
});

describe("credentialVariables", () => {
  it("emits the private key on one line with literal \\n", () => {
    const vars = Object.fromEntries(
      credentialVariables({
        id: 7,
        slug: "orbit",
        client_id: "cid",
        client_secret: "csec",
        webhook_secret: "wh",
        pem: "-----BEGIN KEY-----\nabc\n-----END KEY-----\n",
        html_url: "https://github.com/apps/orbit",
      })
    );
    expect(vars.GITHUB_APP_ID).toBe("7");
    expect(vars.GITHUB_APP_PRIVATE_KEY).toBe("-----BEGIN KEY-----\\nabc\\n-----END KEY-----");
    expect(Object.keys(vars)).toContain("GITHUB_WEBHOOK_SECRET");
  });
});

describe("escapeHtml", () => {
  it("escapes markup and quotes", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });
});
