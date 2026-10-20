import { describe, it, expect, vi, beforeEach } from "vitest";

const { executeRaw, queryRaw } = vi.hoisted(() => ({
  executeRaw: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/db/index", () => ({
  prisma: { $executeRawUnsafe: executeRaw, $queryRawUnsafe: queryRaw },
}));

import { ensureVectorSetup } from "@/lib/db/vector";

describe("ensureVectorSetup", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    executeRaw.mockReset().mockResolvedValue(0);
    queryRaw.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("never drops or alters a non-vector embedding column", async () => {
    queryRaw.mockResolvedValue([{ udt_name: "text" }]);

    await ensureVectorSetup();

    const statements = executeRaw.mock.calls.map((c) => String(c[0]));
    expect(statements.some((sql) => /ALTER TABLE|DROP COLUMN/i.test(sql))).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("Refusing to modify"));
  });

  it("stays silent for proper vector columns", async () => {
    queryRaw.mockResolvedValue([{ udt_name: "vector" }]);

    await ensureVectorSetup();

    expect(console.error).not.toHaveBeenCalled();
  });
});
