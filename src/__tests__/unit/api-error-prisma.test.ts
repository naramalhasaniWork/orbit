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
});
