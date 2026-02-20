import { describe, it, expect } from "vitest";
import { generateSlug } from "@/lib/utils/slug";

describe("generateSlug", () => {
  it("generates a slug from simple text", () => {
    const slug = generateSlug("My Project");
    expect(slug).toMatch(/^my-project-[a-z0-9]{6}$/);
  });

  it("lowercases the input", () => {
    const slug = generateSlug("UPPERCASE");
    expect(slug.startsWith("uppercase-")).toBe(true);
  });

  it("replaces special characters with dashes", () => {
    const slug = generateSlug("hello@world#test!");
    expect(slug).toMatch(/^hello-world-test-[a-z0-9]{6}$/);
  });

  it("removes leading and trailing dashes from base", () => {
    const slug = generateSlug("---leading---");
    expect(slug).toMatch(/^leading-[a-z0-9]{6}$/);
  });

  it("truncates base to 30 characters", () => {
    const long = "a".repeat(50);
    const slug = generateSlug(long);
    // base is 30 chars + dash + 6 char suffix = 37 max
    const base = slug.slice(0, slug.lastIndexOf("-"));
    expect(base.length).toBeLessThanOrEqual(30);
  });

  it("appends a random 6-character suffix", () => {
    const slug = generateSlug("test");
    const suffix = slug.split("-").pop();
    expect(suffix).toHaveLength(6);
    expect(suffix).toMatch(/^[a-z0-9]+$/);
  });

  it("generates unique slugs for the same input", () => {
    const slug1 = generateSlug("same");
    const slug2 = generateSlug("same");
    expect(slug1).not.toBe(slug2);
  });

  it("handles numeric input", () => {
    const slug = generateSlug("123 456");
    expect(slug).toMatch(/^123-456-[a-z0-9]{6}$/);
  });

  it("handles empty string", () => {
    const slug = generateSlug("");
    // base is empty after processing, so slug is just "-suffix"
    expect(slug).toMatch(/^-[a-z0-9]{6}$/);
  });

  it("collapses consecutive special chars into single dash", () => {
    const slug = generateSlug("a   b---c");
    expect(slug).toMatch(/^a-b-c-[a-z0-9]{6}$/);
  });
});
