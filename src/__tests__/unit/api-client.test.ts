import { describe, it, expect } from "vitest";
import { apiErrorMessage } from "@/lib/api-client";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("apiErrorMessage", () => {
  it("reads the standard { error: { message } } shape", async () => {
    const res = json({ success: false, error: { message: "Background workers unavailable", code: "WORKERS_UNAVAILABLE" } }, 503);
    expect(await apiErrorMessage(res, "Failed to start run")).toBe("Background workers unavailable");
  });

  it("reads the older { error: string } shape", async () => {
    expect(await apiErrorMessage(json({ error: "Project not found" }, 404), "x")).toBe("Project not found");
  });

  it("falls back to a message with the status when the body has none", async () => {
    const res = new Response("<html>oops</html>", { status: 500 });
    expect(await apiErrorMessage(res, "Audit failed")).toBe("Audit failed (HTTP 500)");
  });
});
