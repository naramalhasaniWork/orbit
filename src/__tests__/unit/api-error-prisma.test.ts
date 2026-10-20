import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import { Prisma } from "@/generated/prisma/client";
import { handleApiError } from "@/lib/utils/api";

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError("boom", { code, clientVersion: "7" });

describe("handleApiError with Prisma errors", () => {
  it("maps P2025 (record not found) to 404", async () => {
    const res = handleApiError(prismaError("P2025"));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  });

  it("maps P2002 (unique constraint) to 409", async () => {
    const res = handleApiError(prismaError("P2002"));
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("CONFLICT");
  });

  it("keeps other Prisma errors as 500", () => {
    expect(handleApiError(prismaError("P1001")).status).toBe(500);
  });

  it("shares route()'s mapping: all zod issues, 503 Retry-After, request id on 500", async () => {
    const { z } = await import("zod");
    const zod = z.object({ a: z.string(), b: z.number() }).safeParse({});
    const bad = handleApiError(zod.success ? null : zod.error);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.details).toHaveLength(2);

    const { ServiceUnavailableError } = await import("@/server/http/errors");
    expect(handleApiError(new ServiceUnavailableError("down")).headers.get("Retry-After")).toBe("30");

    const err = await handleApiError(new Error("secret detail")).json();
    expect(err.error.requestId).toBeTruthy();
    expect(JSON.stringify(err)).not.toContain("secret detail");
  });
});
