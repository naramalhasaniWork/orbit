/**
 * Orbit MCP Server
 *
 * Exposes Orbit data (test results, test plans, system map) as an MCP server
 * for AI coding tools like Cursor, Claude Code, and VS Code Copilot.
 *
 * Tools provided:
 * - orbit_get_test_health: Get test health summary for a project
 * - orbit_get_test_plan: Get the current test plan
 * - orbit_get_run_results: Get results from the latest or specific run
 * - orbit_get_system_map: Get the system map (routes, components, endpoints)
 * - orbit_get_failing_tests: Get currently failing tests with explanations
 * - orbit_get_coverage: Get test coverage information for files/routes
 */

import {
  getTestHealth,
  getTestPlan,
  getRunResults,
  getSystemMap,
  getFailingTests,
  getCoverage,
} from "@/services/mcp/tool-handlers";

// ============================================================
// Tool Definitions
// ============================================================

export const MCP_TOOLS = [
  {
    name: "orbit_get_test_health",
    description:
      "Get the overall test health summary for a project, including pass rate, failing tests, and flaky tests.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "orbit_get_test_plan",
    description:
      "Get the current active test plan for a project, including all test cases with their priorities and rationale.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "orbit_get_run_results",
    description:
      "Get test results from the latest run or a specific run, including pass/fail verdicts and failure explanations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
        runId: {
          type: "string",
          description:
            "Specific run ID. If omitted, returns the latest completed run.",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "orbit_get_system_map",
    description:
      "Get the system map for a project — routes, components, endpoints, and their relationships.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
        nodeType: {
          type: "string",
          description:
            "Filter by node type: route, component, endpoint, model, auth_strategy, middleware",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "orbit_get_failing_tests",
    description:
      "Get all currently failing tests for a project with failure explanations and suggested fixes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "orbit_get_coverage",
    description:
      "Get test coverage information — which routes and files are covered by tests.",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
        filePath: {
          type: "string",
          description: "Filter coverage for a specific file path",
        },
      },
      required: ["projectId"],
    },
  },
] as const;

// ============================================================
// Tool Router
// ============================================================

export async function handleMcpTool(
  toolName: string,
  args: Record<string, string>
): Promise<unknown> {
  switch (toolName) {
    case "orbit_get_test_health":
      return getTestHealth(args.projectId);
    case "orbit_get_test_plan":
      return getTestPlan(args.projectId);
    case "orbit_get_run_results":
      return getRunResults(args.projectId, args.runId);
    case "orbit_get_system_map":
      return getSystemMap(args.projectId, args.nodeType);
    case "orbit_get_failing_tests":
      return getFailingTests(args.projectId);
    case "orbit_get_coverage":
      return getCoverage(args.projectId, args.filePath);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
