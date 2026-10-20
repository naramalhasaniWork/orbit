import { describe, it, expect } from "vitest";
import { buildSearch, readParams, parsePositiveInt } from "@/lib/url-state";

const defaults = { status: "", sort: "newest", page: "1" };

describe("readParams", () => {
  it("falls back to defaults", () => {
    expect(readParams("", defaults)).toEqual(defaults);
  });

  it("reads known keys and ignores others", () => {
    expect(readParams("?status=failed&page=3&project=p1", defaults)).toEqual({
      status: "failed",
      sort: "newest",
      page: "3",
    });
  });
});

describe("buildSearch", () => {
  it("sets values and preserves unrelated params", () => {
    expect(buildSearch("project=p1", { status: "failed" }, defaults)).toBe("project=p1&status=failed");
  });

  it("drops null and default values", () => {
    expect(buildSearch("status=failed&page=4", { status: null, page: "1" }, defaults)).toBe("");
  });

  it("leaves keys that are not updated alone", () => {
    expect(buildSearch("sort=oldest&page=2", { page: "3" }, defaults)).toBe("sort=oldest&page=3");
  });

  it("encodes values", () => {
    expect(buildSearch("", { status: "a b&c" }, defaults)).toBe("status=a+b%26c");
  });
});

describe("parsePositiveInt", () => {
  it("rejects junk", () => {
    expect(parsePositiveInt("abc", 1)).toBe(1);
    expect(parsePositiveInt("-2", 1)).toBe(1);
    expect(parsePositiveInt("0", 1)).toBe(1);
    expect(parsePositiveInt("7", 1)).toBe(7);
  });
});
