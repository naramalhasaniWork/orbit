import { describe, it, expect } from "vitest";
import { Writable } from "node:stream";
import { createLogger, runWithLogContext } from "@/server/observability/logger";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  return { lines, log: createLogger(stream, { level: "info" }) };
}

describe("logger", () => {
  it("stamps requestId and workspaceId from the async context, including after the id is set later", () => {
    const { lines, log } = capture();
    const ctx: { requestId: string; workspaceId?: string } = { requestId: "req-1" };
    runWithLogContext(ctx, () => {
      log.info("before");
      ctx.workspaceId = "ws-1";
      log.info("after");
    });
    log.info("outside");
    expect(lines[0]).toMatchObject({ requestId: "req-1" });
    expect(lines[0]).not.toHaveProperty("workspaceId");
    expect(lines[1]).toMatchObject({ requestId: "req-1", workspaceId: "ws-1" });
    expect(lines[2]).not.toHaveProperty("requestId");
  });

  it("redacts credentials at any of the first few levels, including the integration keys redact.ts guards", () => {
    const { lines, log } = capture();
    log.info(
      {
        authorization: "Bearer a",
        req: { headers: { authorization: "Bearer b", cookie: "c=1" } },
        settings: { linearApiKey: "lin_secret", slackWebhookUrl: "https://hooks.slack.com/x" },
        webhook: { config: { secret: "whsec_1" } },
        keep: "visible",
      },
      "hello"
    );
    const out = JSON.stringify(lines[0]);
    for (const leaked of ["Bearer a", "Bearer b", "c=1", "lin_secret", "hooks.slack.com", "whsec_1"]) {
      expect(out).not.toContain(leaked);
    }
    expect(lines[0].keep).toBe("visible");
  });

  it("serializes errors", () => {
    const { lines, log } = capture();
    log.error({ err: new Error("boom") }, "failed");
    expect(lines[0].err).toMatchObject({ message: "boom", type: "Error" });
  });
});
