import { describe, it, expect } from "vitest";
import { substituteCredentials } from "@/lib/utils/credentials";
import { isProviderError } from "@/services/execution/test-case-executor";

describe("isProviderError", () => {
  it("classifies Anthropic billing errors as provider errors", () => {
    expect(
      isProviderError(
        '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}'
      )
    ).toBe(true);
  });

  it("classifies auth and quota errors as provider errors", () => {
    expect(isProviderError("401 authentication_error: invalid api key")).toBe(true);
    expect(isProviderError("insufficient_quota: plan limit reached")).toBe(true);
  });

  it("does not classify app-under-test failures as provider errors", () => {
    expect(isProviderError("Timeout waiting for selector #submit")).toBe(false);
    expect(isProviderError("net::ERR_NAME_NOT_RESOLVED at https://staging.example.com")).toBe(false);
    expect(isProviderError("Expected status 200 but got 500")).toBe(false);
  });
});

describe("substituteCredentials", () => {
  it("replaces credential placeholders", () => {
    expect(
      substituteCredentials("Bearer {{credential:API_TOKEN}}", {
        API_TOKEN: "abc123",
      })
    ).toBe("Bearer abc123");
  });

  it("replaces multiple placeholders and trims keys", () => {
    expect(
      substituteCredentials(
        '{"user":"{{credential: USERNAME }}","pass":"{{credential:PASSWORD}}"}',
        { USERNAME: "u", PASSWORD: "p" }
      )
    ).toBe('{"user":"u","pass":"p"}');
  });

  it("substitutes empty string for unknown keys", () => {
    expect(substituteCredentials("{{credential:MISSING}}", {})).toBe("");
  });
});
