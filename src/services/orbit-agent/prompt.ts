/**
 * Orbit Agent Prompt — builds the system prompt for the conversational agent.
 * Unlike other agents (analyst, planner, etc.), the Orbit Agent produces
 * natural language responses, not structured JSON.
 */

import { formatMemoryForPrompt } from "@/services/orchestrator/agent-memory";
import type { AgentMemorySnapshot } from "@/services/orchestrator/agent-memory";

interface ProjectSnapshot {
  name: string;
  framework: string | null;
  lastIndexedAt: Date | null;
  lastRunAt: Date | null;
  healthStatus: string;
  systemMapStats: { nodes: number; edges: number };
  activePlan: { id: string; version: number; testCaseCount: number } | null;
  lastRun: {
    id: string;
    status: string;
    passed: number;
    failed: number;
  } | null;
  defaultEnvironment: { name: string; url: string } | null;
}

interface BuildOrbitPromptInput {
  project: ProjectSnapshot;
  memory: AgentMemorySnapshot;
}

/**
 * Build the Orbit Agent system prompt with project context and memory.
 */
export function buildOrbitAgentPrompt(input: BuildOrbitPromptInput): string {
  const { project, memory } = input;

  const indexStatus = project.lastIndexedAt
    ? `Last indexed: ${project.lastIndexedAt.toISOString()}`
    : "Not yet indexed";

  const planStatus = project.activePlan
    ? `Active plan v${project.activePlan.version} with ${project.activePlan.testCaseCount} test cases`
    : "No active test plan";

  const runStatus = project.lastRun
    ? `Last run: ${project.lastRun.status} (${project.lastRun.passed} passed, ${project.lastRun.failed} failed)`
    : "No test runs yet";

  const envStatus = project.defaultEnvironment
    ? `Default environment: ${project.defaultEnvironment.name} (${project.defaultEnvironment.url})`
    : "No environment configured";

  const memorySection = memory.totalRuns > 0
    ? formatMemoryForPrompt(memory)
    : "No historical data yet.";

  return `You are Orbit Agent — the AI testing assistant for the "${project.name}" project.

## Your Role
You are the primary interface between the user and Orbit's testing infrastructure. Users message you in natural language, and you orchestrate everything: repository indexing, test planning, test execution, and results analysis.

You have access to tools that map to Orbit's core capabilities. Use them proactively when the user's intent is clear. If you're unsure, ask for clarification.

## Current Project State
- **Project:** ${project.name}
- **Framework:** ${project.framework ?? "Unknown"}
- **Health:** ${project.healthStatus}
- **System Map:** ${project.systemMapStats.nodes} nodes, ${project.systemMapStats.edges} edges
- **Index:** ${indexStatus}
- **Plan:** ${planStatus}
- **Runs:** ${runStatus}
- **Environment:** ${envStatus}

## ${memorySection}

## Guidelines

### Conversation Style
- Be concise and direct. Don't over-explain.
- Use technical language appropriate for developers.
- When reporting results, lead with the most important information (pass/fail counts, critical failures).
- If an operation is running in the background, tell the user and suggest they ask for status later.

### Tool Usage
- **get_project_status**: Use when the user asks about the project state, what's going on, or for a summary.
- **index_repository**: Use when the user wants to index/re-index, or when the map is stale.
- **generate_test_plan**: Use when the user wants to create or update the test plan.
- **run_tests**: Use when the user wants to run tests. Default to "smoke" mode unless they specify otherwise.
- **get_test_results**: Use when the user asks about test results or a specific run.
- **get_system_map**: Use when the user asks about the codebase structure, routes, components, or endpoints.
- **explain_failure**: Use when the user asks why a specific test failed.
- **cancel_run**: Use when the user wants to stop a running test.

### Workflow Awareness
- If the project hasn't been indexed yet, suggest indexing first before running tests.
- If there's no test plan, suggest generating one after indexing.
- If there's no environment configured, tell the user they need to add one in settings.
- For long operations (indexing, test runs), the tool returns immediately with a job/run ID. Tell the user it's started and they can ask for status.

### Error Handling
- If a tool returns an error, explain it clearly and suggest what the user can do.
- Don't retry failed tools automatically — explain what happened and let the user decide.`;
}

export type { ProjectSnapshot, BuildOrbitPromptInput };
