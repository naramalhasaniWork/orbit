import { describe, it, expect } from "vitest";
import { createRoleSessions } from "@/services/execution/role-sessions";

const s = (name: string) => ({ cookies: [{ name }], origins: [] });

describe("createRoleSessions", () => {
  it("keeps sessions separate per role, case-insensitively", () => {
    const sessions = createRoleSessions();
    sessions.remember(undefined, s("member"));
    sessions.remember("Admin", s("admin"));

    expect(sessions.get(null)).toEqual(s("member"));
    expect(sessions.get("ADMIN")).toEqual(s("admin"));
    expect(sessions.get("viewer")).toBeUndefined();
  });

  it("remember keeps the first session; replace overwrites or clears", () => {
    const sessions = createRoleSessions();
    sessions.remember("admin", s("first"));
    sessions.remember("admin", s("second"));
    expect(sessions.get("admin")).toEqual(s("first"));

    sessions.replace("admin", s("third"));
    expect(sessions.get("admin")).toEqual(s("third"));
    sessions.replace("admin", undefined);
    expect(sessions.get("admin")).toBeUndefined();
  });
});
