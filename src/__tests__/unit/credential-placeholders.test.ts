import { describe, it, expect, vi } from "vitest";
import type { Page } from "playwright";
import { buildExecutorPrompt as buildPromptParts, type ExecutorContext } from "@/agents/prompts/executor-prompt";

/** Everything the model sees: rules, test-case block and the turn message. */
const buildExecutorPrompt = (context: ExecutorContext) => {
  const p = buildPromptParts(context);
  return [p.rules, p.testCase, p.turn].join("\n\n");
};
import { buildAuthSpecialistPrompt } from "@/agents/prompts/sub-agents/auth-specialist";
import { performAction } from "@/services/execution/action-performer";
import {
  redactCredentials,
  serializeContextWithoutSecrets,
  substituteCredentials,
  findMissingCredentialKeys,
} from "@/lib/utils/credentials";

const SECRETS = {
  TEST_EMAIL: "qa.bot@acme-example.com",
  TEST_PASSWORD: "hunter2-Sup3r!Secret",
  API_TOKEN: "fixture-secret-value-123",
};

function baseContext(overrides: Partial<ExecutorContext> = {}): ExecutorContext {
  return {
    testCaseId: "tc-1",
    testCaseName: "Login works",
    currentStepIndex: 0,
    steps: [{ action: "Log in with the test account", expected: "Dashboard is shown" }],
    pageState: {
      url: "https://staging.acme.test/login",
      title: "Sign in",
      visibleText: "Welcome back. Please sign in.",
      interactiveElements: [
        { tag: "input", selector: "input[name=email]", type: "email" },
        { tag: "input", selector: "input[name=password]", type: "password" },
      ],
    },
    screenshotDescription: "Step 1 of 1",
    previousActions: [],
    testCredentials: SECRETS,
    ...overrides,
  };
}

function expectNoSecrets(prompt: string) {
  for (const value of Object.values(SECRETS)) {
    expect(prompt).not.toContain(value);
  }
}

describe("executor prompt never contains secret values", () => {
  it("lists credentials by placeholder only", () => {
    const prompt = buildExecutorPrompt(baseContext());
    expectNoSecrets(prompt);
    for (const key of Object.keys(SECRETS)) {
      expect(prompt).toContain(`{{credential:${key}}}`);
    }
  });

  it("scrubs values that leak in through page text, history, steps and notes", () => {
    const prompt = buildExecutorPrompt(
      baseContext({
        steps: [
          {
            action: `Enter ${SECRETS.TEST_PASSWORD} into the password field`,
            expected: "ok",
            selectorHint: SECRETS.TEST_EMAIL,
          },
        ],
        pageState: {
          url: `https://staging.acme.test/?token=${SECRETS.API_TOKEN}`,
          title: `Signed in as ${SECRETS.TEST_EMAIL}`,
          visibleText: `Echoed password: ${SECRETS.TEST_PASSWORD}`,
          interactiveElements: [
            { tag: "span", text: SECRETS.TEST_EMAIL, selector: "#who" },
          ],
        },
        previousActions: [
          { action: "fill input[name=password]", result: `Filled with ${SECRETS.TEST_PASSWORD}` },
        ],
        testingNotes: [
          { category: "credential-hint", content: `The password is ${SECRETS.TEST_PASSWORD}` },
        ],
        screenshotDescription: `Showing ${SECRETS.API_TOKEN}`,
      })
    );
    expectNoSecrets(prompt);
    expect(prompt).toContain("Echoed password: {{credential:TEST_PASSWORD}}");
  });

  it("handles missing credentials", () => {
    const prompt = buildExecutorPrompt(baseContext({ testCredentials: undefined }));
    expect(prompt).toContain("(none provided)");
  });
});

describe("auth specialist prompt never contains secret values", () => {
  it("uses placeholders and scrubs history/HTML", () => {
    const prompt = buildAuthSpecialistPrompt({
      authType: "login",
      pageUrl: "https://staging.acme.test/login",
      pageHtml: `<input value="${SECRETS.TEST_PASSWORD}">`,
      interactiveElements: [{ tag: "input", selector: "input[name=email]" }],
      testCredentials: SECRETS,
      previousActions: [{ action: "fill", result: SECRETS.TEST_EMAIL }],
      expectedOutcome: "Dashboard",
    });
    expectNoSecrets(prompt);
    expect(prompt).toContain("{{credential:TEST_PASSWORD}}");
  });
});

describe("action performer substitutes the real value only at fill time", () => {
  function fakePage() {
    const fill = vi.fn(async () => {});
    const locator = { count: async () => 1, first: () => locator, fill };
    const page = {
      locator: () => locator,
      getByText: () => locator,
      getByRole: () => locator,
      getByLabel: () => locator,
      getByPlaceholder: () => locator,
    } as unknown as Page;
    return { page, fill };
  }

  it("fills the secret but returns a result string without it", async () => {
    const { page, fill } = fakePage();
    const result = await performAction(
      page,
      { action: "fill", selector: "input[name=password]", value: "{{credential:TEST_PASSWORD}}", reason: "login" },
      undefined,
      SECRETS
    );
    expect(fill).toHaveBeenCalledWith(SECRETS.TEST_PASSWORD, expect.anything());
    expect(result).not.toContain(SECRETS.TEST_PASSWORD);
  });

  it("passes literal (non-placeholder) values through unchanged", async () => {
    const { page, fill } = fakePage();
    await performAction(
      page,
      { action: "fill", selector: "input[name=q]", value: "search term", reason: "r" },
      undefined,
      SECRETS
    );
    expect(fill).toHaveBeenCalledWith("search term", expect.anything());
  });

  it("fails clearly for an unknown placeholder key without leaking anything", async () => {
    const { page, fill } = fakePage();
    await expect(
      performAction(
        page,
        { action: "fill", selector: "input", value: "{{credential:NOPE}}", reason: "r" },
        undefined,
        SECRETS
      )
    ).rejects.toThrow("Unknown credential placeholder: NOPE");
    expect(fill).not.toHaveBeenCalled();
  });
});

describe("credential helpers", () => {
  it("substitutes and trims keys", () => {
    expect(substituteCredentials("a {{credential: TEST_EMAIL }} b", SECRETS)).toBe(`a ${SECRETS.TEST_EMAIL} b`);
  });

  it("reports missing keys once", () => {
    expect(
      findMissingCredentialKeys("{{credential:X}} {{credential:X}} {{credential:TEST_EMAIL}}", SECRETS)
    ).toEqual(["X"]);
  });

  it("redacts longest values first and ignores very short values", () => {
    const creds = { SHORT: "ab", LONG: "password-123", PREFIX: "password" };
    expect(redactCredentials("ab password-123 password", creds)).toBe(
      "ab {{credential:LONG}} {{credential:PREFIX}}"
    );
  });
});

describe("serializeContextWithoutSecrets (sub-agent context)", () => {
  it("replaces testCredentials values and scrubs leaks elsewhere in the context", () => {
    const out = serializeContextWithoutSecrets({
      authType: "login",
      testCredentials: SECRETS,
      previousActions: [{ action: "fill", result: `typed ${SECRETS.TEST_PASSWORD}` }],
    });
    expectNoSecrets(out);
    expect(out).toContain("{{credential:TEST_PASSWORD}}");
    expect(out).toContain('"authType": "login"');
  });

  it("serializes contexts without credentials unchanged", () => {
    expect(serializeContextWithoutSecrets({ a: 1 })).toBe(JSON.stringify({ a: 1 }, null, 2));
  });
});
