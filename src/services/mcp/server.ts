/**
 * Orbit MCP Server
 *
 * Exposes Orbit's testing capabilities as MCP-compatible tools.
 * Follows the Model Context Protocol spec for AI coding tool integrations.
 *
 * Tools:
 * - orbit_trigger_run: Trigger a test run for a project
 * - orbit_get_system_map: Get the system map for a project
 * - orbit_get_test_plan: Get the active test plan
 * - orbit_get_run_results: Get results for a specific run
 * - orbit_get_health: Get project health and trends
 * - orbit_search_failures: Search failure patterns across runs
 * - orbit_audit_code: Run a code quality audit
 */

import {
  getTestHealth,
  getTestPlan,
  getRunResults,
  getSystemMap,
  getFailingTests,
  getCoverage,
  triggerRun,
  searchFailures,
  auditCode,
} from "@/services/mcp/tool-handlers";

// ============================================================
// Types
// ============================================================

interface MCPToolInputSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: MCPToolInputSchema;
}

// ============================================================
// Tool Definitions
// ============================================================

export const MCP_TOOLS: MCPTool[] = [
  {
    name: "orbit_trigger_run",
    description: "Trigger a test run for a project",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
        mode: {
          type: "string",
          enum: ["full", "smoke", "regression", "targeted"],
          description: "Run mode (defaults to smoke)",
        },
        trigger: {
          type: "string",
          default: "api",
          description: "Trigger source (defaults to api)",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "orbit_get_system_map",
    description:
      "Get the system map for a project — routes, components, endpoints, and their relationships",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
        nodeType: {
          type: "string",
          description:
            "Filter by type: route, component, endpoint, model, auth_strategy, middleware",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "orbit_get_test_plan",
    description:
      "Get the current active test plan for a project with all test cases, priorities, and rationale",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "orbit_get_run_results",
    description:
      "Get test results from a specific run or the latest completed run",
    inputSchema: {
      type: "object",
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
    name: "orbit_get_health",
    description:
      "Get project health status, pass rates, flaky tests, and recent trends",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
      },
      required: ["projectId"],
    },
  },
  {
    name: "orbit_search_failures",
    description: "Search failure patterns across recent test runs",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
        query: {
          type: "string",
          description: "Search term to filter failure messages",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 20)",
        },
      },
      required: ["projectId"],
    },
  },
  {
    name: "orbit_audit_code",
    description:
      "Run a code quality audit on the project, returning coverage gaps and recommendations",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The Orbit project ID" },
        filePath: {
          type: "string",
          description: "Filter audit to a specific file path",
        },
      },
      required: ["projectId"],
    },
  },
];

// ============================================================
// Tool Router
// ============================================================

export async function handleMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const projectId = args.projectId as string;

  switch (toolName) {
    case "orbit_trigger_run":
      return triggerRun(
        projectId,
        (args.mode as string) ?? "smoke",
        (args.trigger as string) ?? "api"
      );
    case "orbit_get_system_map":
      return getSystemMap(projectId, args.nodeType as string | undefined);
    case "orbit_get_test_plan":
      return getTestPlan(projectId);
    case "orbit_get_run_results":
      return getRunResults(projectId, args.runId as string | undefined);
    case "orbit_get_health":
      return getTestHealth(projectId);
    case "orbit_search_failures":
      return searchFailures(
        projectId,
        args.query as string | undefined,
        args.limit as number | undefined
      );
    case "orbit_audit_code":
      return auditCode(projectId, args.filePath as string | undefined);
    case "orbit_get_failing_tests":
      return getFailingTests(projectId);
    case "orbit_get_coverage":
      return getCoverage(projectId, args.filePath as string | undefined);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}
